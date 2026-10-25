import { NAMESPACE } from "./remote.js";
//#region src/index.ts
/**
* 桌宠边界流，宿主半（node face）。
*
* 宿主把 `session/event` 里��� `turn/start` / `turn/end` 投影成一条只读事件流，
* 经 Typert 的 `remote.rainbowPet/watch` 下发给浏览器半。桌宠据此区分
* 「这一轮真的跑完了」「被取消了」「挂了」——这三者对用户是三种不同的信号，
* 客户端的会话快照只能看出「现在不在跑了」，分不出来。
*
* 设计约束：
* - **只读**：不持有会话内容、不读历史、不处理审批、不调用模型；
* - **不追事件**：只转发边界，不重扫 `session.events`；
* - **可丢弃**：观察者积压时丢弃陈旧边界并补一个基线，而不是补播「成功」；
* - **幂等**：同一会话的重复序号只认第一次。
*
* 边界帧的形状与 Typert 描述符见 `src/remote.ts`；宿主面清单见
* `src/typert.host.ts`。
*
* @module @kenz1117/dsh-ui-rainbowspeak
*/
/** Cordis 插件名（同时是本插件提供的服务名与远端命名空间）。 */
const name = NAMESPACE;
/**
* 宿主侧依赖：`agents` 用来判定一个会话是不是子代理。
*
* 放在 `inject` 里而非直接取，是为了让缺少该服务的 profile 安静地不装本插件，
* 而不是抛错——宿主规范明确要求可选服务走 `inject`。
*/
const inject = ["agents"];
/** 单个观察者的积压上限（帧数）。超过即丢弃陈旧边界并补基线。 */
const QUEUE_LIMIT = 128;
/** 基线帧里会话身份清单的上限。 */
const MAX_IDENTITIES = 4096;
/** 已见序号的记忆上限（会话数）。 */
const MAX_TRACKED_SESSIONS = 4096;
/** 回合结束原因缺省值（宿主事件未带 reason 时的占位）。 */
const UNKNOWN_REASON = "unknown";
/**
* 判定会话是否为子代理。
*
* `agents` 不可用或会话查不到时返回空对象——身份是可选信息，
* 绝不臆造归属分类。
* @param agents - 宿主 `agents` 服务（可能缺席）。
* @param sessionId - 会话身份。
* @returns 身份标记；无法判定时为空对象。
*/
function runtimeIdentity(agents, sessionId) {
	try {
		const service = agents;
		if (typeof service?.get !== "function" || typeof service.roots !== "function") return { sessionId };
		const agent = service.get(sessionId);
		if (!agent) return { sessionId };
		return {
			sessionId,
			isSubagent: !service.roots().includes(agent)
		};
	} catch {
		return { sessionId };
	}
}
/**
* 边界流中枢：把宿主事件翻译成边界帧，分发给每个观察者。
*/
var RainbowBoundaryHub = class {
	/** 宿主 `agents` 服务（可选）。 */
	agents;
	/** 宿主进程世代标识：宿主重启后变化，客户端据此丢弃旧流。 */
	hostEpoch;
	/** 宿主流序号（单调递增）。 */
	streamSeq = 0;
	/** 单观察者积压上限。 */
	queueLimit;
	/** 当前观察者集合。 */
	clients = /* @__PURE__ */ new Set();
	/** 每个会话已见到的最大事件序号（去重）。 */
	seen = /* @__PURE__ */ new Map();
	/** 中枢是否已关闭。 */
	closed = false;
	/**
	* @param options - 组装选项。
	*/
	constructor(options = {}) {
		this.agents = options.agents;
		this.hostEpoch = options.epoch ?? globalThis.crypto.randomUUID();
		this.queueLimit = Math.max(2, Math.min(1024, options.queueLimit ?? 128));
	}
	/**
	* 构造基线帧：新观察者接入时的一次性快照。
	* @returns 基线帧；会话清单不可用时为空清单。
	*/
	baseline() {
		let identities = [];
		try {
			const service = this.agents;
			if (typeof service?.list === "function") identities = [...service.list()].slice(0, MAX_IDENTITIES).map((agent) => {
				const id = String(agent?.id ?? "");
				return runtimeIdentity(this.agents, id);
			});
		} catch {
			identities = [];
		}
		return {
			type: "baseline",
			hostEpoch: this.hostEpoch,
			streamSeq: this.streamSeq,
			identities
		};
	}
	/**
	* 接收一个宿主会话事件，只有回合边界会被投影。
	* @param session - 事件所属会话。
	* @param event - 会话事件。
	*/
	accept(session, event) {
		if (this.closed) return;
		if (!event || typeof event !== "object") return;
		const type = event.type;
		if (type !== "turn/start" && type !== "turn/end") return;
		const sessionId = session?.id;
		if (typeof sessionId !== "string" || sessionId.length === 0) return;
		const seq = event.seq;
		if (typeof seq !== "number" || !Number.isSafeInteger(seq) || seq < 0) return;
		const last = this.seen.get(sessionId);
		if (last !== void 0 && seq <= last) return;
		this.seen.delete(sessionId);
		this.seen.set(sessionId, seq);
		if (this.seen.size > MAX_TRACKED_SESSIONS) {
			const oldest = this.seen.keys().next();
			if (!oldest.done) this.seen.delete(oldest.value);
		}
		const time = event.time;
		const identity = runtimeIdentity(this.agents, sessionId);
		const shared = {
			hostEpoch: this.hostEpoch,
			streamSeq: ++this.streamSeq,
			sessionId,
			seq,
			time: typeof time === "number" && Number.isFinite(time) ? time : Date.now(),
			...identity.isSubagent === void 0 ? {} : { isSubagent: identity.isSubagent }
		};
		if (type === "turn/start") {
			this.push({
				type: "turn/start",
				...shared
			});
			return;
		}
		this.push({
			type: "turn/end",
			...shared,
			reason: this.reasonOf(event)
		});
	}
	/**
	* 取出回合结束原因。
	* @param event - 会话事件。
	* @returns 结束原因 kind；缺失时为 `'unknown'`。
	*/
	reasonOf(event) {
		const reason = event.data?.reason?.kind;
		return typeof reason === "string" && reason.length > 0 ? reason.slice(0, 80) : UNKNOWN_REASON;
	}
	/**
	* 把一帧分发给全部观察者。
	* @param frame - 边界帧。
	*/
	push(frame) {
		for (const client of this.clients) client.push(frame);
	}
	/**
	* 订阅边界流。
	*
	* 返回的迭代器在连接时先吐一个基线帧，随后是增量边界；`signal` 中止或
	* 迭代器 `return()` 时立即退订。
	* @param signal - 中止信号。
	* @returns 边界帧的异步迭代器。
	*/
	watch(signal) {
		const hub = this;
		const queue = [];
		let resolveNext;
		let ended = this.closed || signal?.aborted === true;
		const finish = () => {
			if (ended) return;
			ended = true;
			hub.clients.delete(client);
			signal?.removeEventListener("abort", finish);
			queue.length = 0;
			if (resolveNext) {
				const resolve = resolveNext;
				resolveNext = void 0;
				resolve({
					done: true,
					value: void 0
				});
			}
		};
		const client = { push(frame) {
			if (ended) return;
			if (resolveNext) {
				const resolve = resolveNext;
				resolveNext = void 0;
				resolve({
					done: false,
					value: frame
				});
				return;
			}
			if (queue.length >= hub.queueLimit) {
				queue.length = 0;
				queue.push(hub.baseline());
				return;
			}
			queue.push(frame);
		} };
		if (!ended) {
			this.clients.add(client);
			signal?.addEventListener("abort", finish, { once: true });
			client.push(this.baseline());
		}
		const iterator = {
			next() {
				if (queue.length > 0) return Promise.resolve({
					done: false,
					value: queue.shift()
				});
				if (ended) return Promise.resolve({
					done: true,
					value: void 0
				});
				if (resolveNext) return Promise.reject(/* @__PURE__ */ new Error("Only one bridge iterator read may be pending"));
				return new Promise((resolve) => {
					resolveNext = resolve;
				});
			},
			return() {
				finish();
				return Promise.resolve({
					done: true,
					value: void 0
				});
			},
			[Symbol.asyncIterator]() {
				return iterator;
			}
		};
		return iterator;
	}
	/** 关闭中枢：退订全部观察者并清空去重记忆。 */
	dispose() {
		if (this.closed) return;
		this.closed = true;
		for (const client of [...this.clients]) client.push({
			type: "baseline",
			hostEpoch: this.hostEpoch,
			streamSeq: this.streamSeq,
			identities: []
		});
		this.clients.clear();
		this.seen.clear();
	}
};
/**
* 宿主面插件体：提供边界流服务并把宿主事件接进中枢。
*
* 服务上挂 `typertRemote` 绑定，是 Typert 认得这条远端的方式；
* 它把服务、宿主侧键名与远端命名空间绑在一起，浏览器半据此挂载同名命名空间。
* @param ctx - 宿主根上下文。
*/
function apply(ctx) {
	const hub = new RainbowBoundaryHub({ agents: ctx.get("agents") });
	const service = { watch(signal) {
		return hub.watch(signal);
	} };
	service.typertRemote = Object.freeze({
		service,
		serviceKey: name,
		namespace: name
	});
	ctx.provide(name, service);
	ctx.on("session/event", ((session, event) => hub.accept(session, event)), { global: true });
	ctx.effect(() => () => hub.dispose(), "rainbow-pet.boundary-hub");
}
//#endregion
export { QUEUE_LIMIT, RainbowBoundaryHub, apply, inject, name, runtimeIdentity };
