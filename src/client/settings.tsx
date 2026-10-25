/**
 * 「彩虹边框」设置面板：总开关、流速/宽度滑杆、配色与位置选择、反向/呼吸开关。
 * 偏好读写经 preferences（localStorage 持久化 + `<html>` 实时下发），
 * 文案经宿主 locale 词典（zh/en），语言切换自动重渲染。
 * @module @kenz1117/dsh-ui-rainbowspeak/client/settings
 */

import { useState } from 'react'
import { Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import styles from './settings.module.css'
import { NS, type RainbowKey } from './locales.ts'
import { DEFAULT_PREFS, loadPrefs, savePrefs, type RainbowPalette, type RainbowPrefs, type RainbowSide } from './preferences.ts'
import { PALETTE_STOPS } from './palettes.ts'
import type { PetScope } from './pet-state.ts'

/** 配色方案的选项表（值 → 词典键；跟随主题殿后）。 */
const PALETTE_OPTIONS: readonly { readonly value: RainbowPalette; readonly key: RainbowKey }[] = [
  { value: 'rainbow', key: 'paletteRainbow' },
  { value: 'aurora', key: 'paletteAurora' },
  { value: 'sunset', key: 'paletteSunset' },
  { value: 'peach', key: 'palettePeach' },
  { value: 'ocean', key: 'paletteOcean' },
  { value: 'cyberpunk', key: 'paletteCyberpunk' },
  { value: 'theme', key: 'paletteTheme' },
]

/** 显示位置的选项表（值 → 词典键）。 */
const SIDE_OPTIONS: readonly { readonly value: RainbowSide; readonly key: RainbowKey }[] = [
  { value: 'all', key: 'sideAll' },
  { value: 'top', key: 'sideTop' },
  { value: 'bottom', key: 'sideBottom' },
]

/** 桌宠关注范围的选项表（值 → 词典键）。 */
const PET_SCOPE_OPTIONS: readonly { readonly value: PetScope; readonly key: RainbowKey }[] = [
  { value: 'all', key: 'petScopeAll' },
  { value: 'current', key: 'petScopeCurrent' },
]

/**
 * 更新偏好并持久化（savePrefs 内同步下发 `<html>`，效果即时变化）。
 * @param prefs - 当前偏好。
 * @param patch - 本次变更的字段。
 * @param commit - 状态写入回调（React 受控回显）。
 */
function update(prefs: RainbowPrefs, patch: Partial<RainbowPrefs>, commit: (next: RainbowPrefs) => void): void {
  const next = { ...prefs, ...patch }
  commit(next)
  savePrefs(next)
}

/**
 * 设置面板 section 组件。
 * @param props.t - locale 词典绑定（settings.section 注册注入）。
 * @returns 面板内容。
 */
export function RainbowSettingsSection({ t }: PropsLocale<typeof NS>): React.ReactElement {
  const [prefs, setPrefs] = useState<RainbowPrefs>(loadPrefs)
  const commit = setPrefs
  return (
    <div className={styles.section}>
      <div className={styles.row}>
        <div className={styles.rowText}>
          <span className={styles.label}>{t('enable')}</span>
          <span className={styles.desc}>{t('enableDesc')}</span>
        </div>
        <Switch
          checked={prefs.enabled}
          label={t('enable')}
          onChange={(next) => { update(prefs, { enabled: next }, commit) }}
        />
      </div>

      <div className={styles.row}>
        <div className={styles.rowText}>
          <span className={styles.label}>{t('period')}</span>
          <span className={styles.desc}>{t('stateNote')}</span>
        </div>
        <div className={styles.rangeRow}>
          <input
            className={styles.range}
            type="range"
            min={1}
            max={10}
            step={1}
            value={prefs.periodSec}
            aria-label={t('period')}
            onChange={(event) => { update(prefs, { periodSec: Number(event.currentTarget.value) }, commit) }}
          />
          <span className={styles.value}>{prefs.periodSec} {t('unitPerLoop')}</span>
        </div>
      </div>

      <div className={styles.row}>
        <div className={styles.rowText}>
          <span className={styles.label}>{t('width')}</span>
        </div>
        <div className={styles.rangeRow}>
          <input
            className={styles.range}
            type="range"
            min={1}
            max={6}
            step={1}
            value={prefs.widthPx}
            aria-label={t('width')}
            onChange={(event) => { update(prefs, { widthPx: Number(event.currentTarget.value) }, commit) }}
          />
          <span className={styles.value}>{prefs.widthPx} {t('unitPx')}</span>
        </div>
      </div>

      <div className={styles.stackRow}>
        <span className={styles.label}>{t('palette')}</span>
        <div className={styles.chipGrid}>
          {PALETTE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={prefs.palette === option.value ? `${styles.chip} ${styles.chipActive}` : styles.chip}
              onClick={() => { update(prefs, { palette: option.value }, commit) }}
            >
              <span
                className={styles.swatch}
                style={{ background: `conic-gradient(from 0deg, ${PALETTE_STOPS[option.value]})` }}
                aria-hidden="true"
              />
              <span className={styles.chipLabel}>{t(option.key)}</span>
            </button>
          ))}
        </div>
      </div>

      <div className={styles.row}>
        <div className={styles.rowText}>
          <span className={styles.label}>{t('side')}</span>
        </div>
        <div className={styles.chipRow}>
          {SIDE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={prefs.side === option.value ? `${styles.chip} ${styles.chipActive}` : styles.chip}
              onClick={() => { update(prefs, { side: option.value }, commit) }}
            >
              {t(option.key)}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.row}>
        <div className={styles.rowText}>
          <span className={styles.label}>{t('reverse')}</span>
        </div>
        <Switch
          checked={prefs.reverse}
          label={t('reverse')}
          onChange={(next) => { update(prefs, { reverse: next }, commit) }}
        />
      </div>

      <div className={styles.row}>
        <div className={styles.rowText}>
          <span className={styles.label}>{t('breathe')}</span>
        </div>
        <Switch
          checked={prefs.breathe}
          label={t('breathe')}
          onChange={(next) => { update(prefs, { breathe: next }, commit) }}
        />
      </div>

      <div className={styles.resetRow}>
        <button
          type="button"
          className={styles.chip}
          onClick={() => { const next = { ...DEFAULT_PREFS }; setPrefs(next); savePrefs(next) }}
        >
          {t('reset')}
        </button>
      </div>

      <span className={styles.groupTitle}>{t('petNav')}</span>

      <div className={styles.row}>
        <div className={styles.rowText}>
          <span className={styles.label}>{t('petEnable')}</span>
          <span className={styles.desc}>{t('petEnableDesc')}</span>
        </div>
        <Switch
          checked={prefs.petEnabled}
          label={t('petEnable')}
          onChange={(next) => { update(prefs, { petEnabled: next }, commit) }}
        />
      </div>

      <div className={styles.row}>
        <div className={styles.rowText}>
          <span className={styles.label}>{t('petScope')}</span>
          <span className={styles.desc}>{t('petScopeNote')}</span>
        </div>
        <div className={styles.chipRow}>
          {PET_SCOPE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={prefs.petScope === option.value ? `${styles.chip} ${styles.chipActive}` : styles.chip}
              onClick={() => { update(prefs, { petScope: option.value }, commit) }}
            >
              {t(option.key)}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.row}>
        <div className={styles.rowText}>
          <span className={styles.label}>{t('petScale')}</span>
        </div>
        <div className={styles.rangeRow}>
          <input
            className={styles.range}
            type="range"
            min={0.6}
            max={1.6}
            step={0.1}
            value={prefs.petScale}
            aria-label={t('petScale')}
            onChange={(event) => { update(prefs, { petScale: Number(event.currentTarget.value) }, commit) }}
          />
          <span className={styles.value}>{prefs.petScale.toFixed(1)}×</span>
        </div>
      </div>
    </div>
  )
}