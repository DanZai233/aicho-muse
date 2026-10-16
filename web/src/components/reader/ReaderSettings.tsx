import type { ReaderSettings as Settings } from '../../lib/reader';
import { DEFAULT_READER_SETTINGS } from '../../lib/reader';

export default function ReaderSettings({ value, onChange, compact }: { value: Settings; onChange: (settings: Settings) => void; compact: boolean }) {
  const update = (change: Partial<Settings>) => onChange({ ...value, ...change });
  return <div className="reader-settings">
    <fieldset><legend>页面</legend><div className="reader-options">
      {(['single', 'double'] as const).map(layout => <button key={layout} aria-pressed={value.layout === layout} onClick={() => update({ layout })}>{layout === 'single' ? '单页' : '双页'}</button>)}
    </div>{compact && value.layout === 'double' && <p className="reader-hint">屏幕较窄，暂用单页；宽屏会恢复双页。</p>}</fieldset>
    <label>翻页方向<select value={value.direction} onChange={e => update({ direction: e.target.value as Settings['direction'] })}>
      <option value="left">向左翻 · 从左往右读</option><option value="right">向右翻 · 从右往左翻页</option><option value="up">向上翻 · 上下翻页</option>
    </select></label>
    <label>字号 <span className="reader-setting-value">{value.fontSize} px</span><input aria-label="字号" type="range" min={14} max={32} step={1} value={value.fontSize} onChange={e => update({ fontSize: Number(e.target.value) })} /></label>
    <label>行距 <span className="reader-setting-value">{value.lineHeight.toFixed(1)} 倍</span><input aria-label="行距" type="range" min={1.4} max={2.4} step={0.1} value={value.lineHeight} onChange={e => update({ lineHeight: Number(e.target.value) })} /></label>
    <fieldset><legend>字体</legend><div className="reader-options"><button aria-pressed={value.font === 'serif'} onClick={() => update({ font: 'serif' })}>宋体 · 书卷感</button><button aria-pressed={value.font === 'sans'} onClick={() => update({ font: 'sans' })}>黑体 · 清晰</button></div></fieldset>
    <fieldset><legend>阅读底色</legend><div className="reader-options reader-theme-options">{([['paper', '暖纸'], ['white', '明亮'], ['green', '浅绿'], ['night', '夜间']] as const).map(([theme, label]) => <button key={theme} aria-pressed={value.theme === theme} onClick={() => update({ theme })}>{label}</button>)}</div></fieldset>
    <button className="reader-reset" onClick={() => onChange({ ...DEFAULT_READER_SETTINGS })}>恢复默认设置</button>
    <p className="reader-hint">偏好与阅读位置自动保存在当前浏览器。</p>
  </div>;
}
