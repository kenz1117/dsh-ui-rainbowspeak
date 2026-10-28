/**
 * 「彩虹边框」client 词典：zh/en 键并集必须完全一致（类型化注册的编译约束）。
 * @module @kenz1117/dsh-ui-rainbowspeak/client/locales
 */

/** 词典命名空间（同时用作 LocaleNamespaceMap 的声明合并键）。 */
export const NS = 'ui-rainbowspeak'

/** 「彩虹边框」设置页全部文案键。 */
export type RainbowKey =
  | 'nav'
  | 'enable'
  | 'enableDesc'
  | 'period'
  | 'width'
  | 'unitPerLoop'
  | 'unitPx'
  | 'palette'
  | 'paletteRainbow'
  | 'paletteAurora'
  | 'paletteSunset'
  | 'palettePeach'
  | 'paletteOcean'
  | 'paletteCyberpunk'
  | 'paletteTheme'
  | 'side'
  | 'sideAll'
  | 'sideTop'
  | 'sideBottom'
  | 'reverse'
  | 'breathe'
  | 'stateNote'
  | 'reset'
  | 'petNav'
  | 'petEnable'
  | 'petEnableDesc'
  | 'petScope'
  | 'petScopeAll'
  | 'petScopeCurrent'
  | 'petScale'
  | 'petScopeNote'
  | 'petMotion'
  | 'petMotionNote'
  | 'petMotionFull'
  | 'petMotionSubtle'
  | 'petMotionOff'
  | 'petBall'
  | 'petBallNote'
  | 'petBallRed'
  | 'petBallYellow'
  | 'petBallPink'
  | 'petBallBlue'
  | 'petBallGreen'
  | 'petName'
  | 'petResting'
  | 'petWorking'
  | 'petWaiting'
  | 'petCelebrate'
  | 'petError'
  | 'petSleeping'
  | 'petResting2'
  | 'petWorking2'
  | 'petWaiting2'
  | 'petCelebrate2'
  | 'petError2'
  | 'petSleeping2'
  | 'petPoke1'
  | 'petPoke2'
  | 'petPoke3'
  | 'petPoke4'
  | 'petPoke5'
  | 'petDrag'
  | 'petSpin1'
  | 'petSpin2'
  | 'petPat1'
  | 'petPat2'
  | 'petStumble'
  | 'petWake'
  | 'petStartle1'
  | 'petStartle2'
  | 'petHum1'
  | 'petHum2'
  | 'petMenu'
  | 'petMenuScope'
  | 'petMenuScopeAll'
  | 'petMenuScopeCurrent'
  | 'petMenuSize'
  | 'petMenuSizeSmall'
  | 'petMenuSizeMedium'
  | 'petMenuSizeLarge'
  | 'petMenuHide'
  | 'petMenuResume'

/** 中文文案（宿主语言为中文时的显示文本）。 */
export const zh: Record<RainbowKey, string> = {
  nav: '彩虹边框',
  enable: '启用效果',
  enableDesc: '沿聊天输入框边界流动的彩虹描边',
  period: '流动速度',
  width: '环带宽度',
  unitPerLoop: '秒/圈',
  unitPx: 'px',
  palette: '配色方案',
  paletteRainbow: '经典彩虹',
  paletteAurora: '极光青绿',
  paletteSunset: '日落橙紫',
  palettePeach: '蜜桃粉金',
  paletteOcean: '海洋蓝紫',
  paletteCyberpunk: '赛博霓虹',
  paletteTheme: '跟随主题',
  side: '显示位置',
  sideAll: '四边',
  sideTop: '仅顶边',
  sideBottom: '仅底边',
  reverse: '反向流动',
  breathe: '呼吸明暗',
  stateNote: '会话运行时自动加速，等待审批时琥珀提醒，出错时红色警示',
  reset: '恢复默认',
  petNav: '桌面宠物',
  petEnable: '启用桌宠',
  petEnableDesc: '住在 DSH 窗口里的小虹，可拖拽、随会话状态换表情',
  petScope: '关注范围',
  petScopeAll: '全部会话',
  petScopeCurrent: '当前会话',
  petScopeNote: '成功与失败以宿主的回合边界为准：被取消的一轮不会报喜',
  petScale: '桌宠大小',
  petMotion: '动画强度',
  petMotionNote: '连戳转圈、踉跄这类幅度大的动作按档位收敛；「关」只保留表情切换',
  petMotionFull: '全量',
  petMotionSubtle: '轻柔',
  petMotionOff: '关',
  petBall: '角色',
  petBallNote: '五颗球是五个角色：表情随状态变化，球色不变',
  petBallRed: '红红',
  petBallYellow: '黄黄',
  petBallPink: '粉粉',
  petBallBlue: '蓝蓝',
  petBallGreen: '绿绿',
  petName: '小虹',
  petResting: '陪你待着',
  petWorking: '在忙，稍等',
  petWaiting: '需要你点一下',
  petCelebrate: '这轮跑完啦',
  petError: '这轮出错了',
  petSleeping: '打个盹…',
  petResting2: '在呢，随时喊我',
  petWorking2: '手上有点活…',
  petWaiting2: '就等你点头了',
  petCelebrate2: '搞定！',
  petError2: '唔…摔了一跤',
  petSleeping2: 'Zzz…别吵我',
  petPoke1: '嘿嘿，痒',
  petPoke2: '别戳啦～',
  petPoke3: '在的在的！',
  petPoke4: '干嘛呀（好奇）',
  petPoke5: '咕噜咕噜…',
  petDrag: '哇——放我下来嘛',
  petSpin1: '转圈圈～',
  petSpin2: '晕…天旋地转',
  petPat1: '好舒服～',
  petPat2: '再摸一会儿',
  petStumble: '哎呀，晃了一下',
  petWake: '哈啊——睡醒了',
  petStartle1: '哇！醒了醒了',
  petStartle2: '吓、吓我一跳',
  petHum1: '哼哼～哼哼～',
  petHum2: '♪ 啦啦啦 ♪',
  petMenu: '小虹的菜单',
  petMenuScope: '关注范围',
  petMenuScopeAll: '全部会话',
  petMenuScopeCurrent: '当前会话',
  petMenuSize: '大小',
  petMenuSizeSmall: '小',
  petMenuSizeMedium: '中',
  petMenuSizeLarge: '大',
  petMenuHide: '让小虹躲一会儿',
  petMenuResume: '把小虹叫回来',
}

/** 英文文案（宿主语言为英文时的显示文本）。 */
export const en: Record<RainbowKey, string> = {
  nav: 'Rainbow border',
  enable: 'Enable effect',
  enableDesc: 'A rainbow ring flowing along the composer border',
  period: 'Flow speed',
  width: 'Ring width',
  unitPerLoop: 's/loop',
  unitPx: 'px',
  palette: 'Color scheme',
  paletteRainbow: 'Rainbow',
  paletteAurora: 'Aurora',
  paletteSunset: 'Sunset',
  palettePeach: 'Peach',
  paletteOcean: 'Ocean',
  paletteCyberpunk: 'Cyberpunk',
  paletteTheme: 'Follow theme',
  side: 'Placement',
  sideAll: 'All sides',
  sideTop: 'Top only',
  sideBottom: 'Bottom only',
  reverse: 'Reverse flow',
  breathe: 'Breathing',
  stateNote: 'Speeds up while running, amber while awaiting approval, red on errors',
  reset: 'Reset to defaults',
  petNav: 'Desktop pet',
  petEnable: 'Show the pet',
  petEnableDesc: 'A little rainbow companion in the DSH window — drag it around, it reacts to your session',
  petScope: 'Watch scope',
  petScopeAll: 'All sessions',
  petScopeCurrent: 'Current session',
  petScopeNote: 'Success and failure follow the host turn boundaries — a cancelled turn never celebrates',
  petScale: 'Pet size',
  petMotion: 'Animation',
  petMotionNote: 'Big moves like spins and stumbles scale down with this setting; "Off" keeps only the expression changes',
  petMotionFull: 'Full',
  petMotionSubtle: 'Subtle',
  petMotionOff: 'Off',
  petBall: 'Character',
  petBallNote: 'Five balls, five characters: expressions change with state, the color never does',
  petBallRed: 'Red',
  petBallYellow: 'Yellow',
  petBallPink: 'Pink',
  petBallBlue: 'Blue',
  petBallGreen: 'Green',
  petName: 'Prism',
  petResting: 'Here with you',
  petWorking: 'Busy, one moment',
  petWaiting: 'Needs your click',
  petCelebrate: 'That round is done',
  petError: 'That round failed',
  petSleeping: 'Taking a nap…',
  petResting2: 'Right here, call me anytime',
  petWorking2: 'Got a little something going…',
  petWaiting2: 'Just waiting on your nod',
  petCelebrate2: 'Done!',
  petError2: "Oops… took a tumble",
  petSleeping2: 'Zzz… shh',
  petPoke1: 'Hehe, ticklish',
  petPoke2: "Hey, stop poking me",
  petPoke3: "I'm here, I'm here!",
  petPoke4: 'What is it? (curious)',
  petPoke5: 'Bloop bloop…',
  petDrag: 'Wha— put me down!',
  petSpin1: 'Wheee, spinning~',
  petSpin2: 'Dizzy… the room is turning',
  petPat1: 'Ahh, that feels nice~',
  petPat2: 'Just a little longer…',
  petStumble: 'Whoa— that was a wobble',
  petWake: 'Yaaawn—I am awake',
  petStartle1: "Whoa! I'm up, I'm up",
  petStartle2: 'You startled me!',
  petHum1: 'Hmm~ hmm-hmm~',
  petHum2: '♪ la-la-la ♪',
  petMenu: "Prism's menu",
  petMenuScope: 'Watch scope',
  petMenuScopeAll: 'All sessions',
  petMenuScopeCurrent: 'Current session',
  petMenuSize: 'Size',
  petMenuSizeSmall: 'Small',
  petMenuSizeMedium: 'Medium',
  petMenuSizeLarge: 'Large',
  petMenuHide: 'Let Prism hide for a while',
  petMenuResume: 'Call Prism back',
}