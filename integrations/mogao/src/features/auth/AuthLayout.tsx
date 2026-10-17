import { useState, useEffect } from 'react';
import { useTheme } from '@/shared/contexts/ThemeContext';

const SNIPPETS = [
  { text: '月光如水，洒在古城的青石板上。她不知道，这一次的离别，是否还有重逢……', genre: '江湖情缘' },
  { text: '他握着那柄生锈的宝剑，望向远处连绵的山脉。命运的齿轮，已悄然转动……', genre: '武侠传说' },
  { text: '星河倒悬，万里无云。少年站在悬崖边，身后是整个王朝的兴衰……', genre: '玄幻大陆' },
  { text: '她翻开那本泛黄的日记，第一行字让她的手微微颤抖——「我知道你会来找我的」……', genre: '悬疑迷局' },
  { text: '大漠黄沙，烽火连天。他一剑斩断了三千烦恼，却斩不断心中那道红线……', genre: '烽火乱世' },
];

const PARTICLES = [
  { char: '故', left: 7,  dur: 20, delay: 0,    size: 32, alpha: 0.16 },
  { char: '事', left: 88, dur: 25, delay: 3.5,  size: 24, alpha: 0.11 },
  { char: '墨', left: 22, dur: 17, delay: 7,    size: 42, alpha: 0.20 },
  { char: '笔', left: 62, dur: 22, delay: 1.5,  size: 22, alpha: 0.13 },
  { char: '云', left: 43, dur: 28, delay: 9,    size: 34, alpha: 0.14 },
  { char: '梦', left: 75, dur: 19, delay: 5,    size: 28, alpha: 0.18 },
  { char: '诗', left: 13, dur: 23, delay: 12,   size: 26, alpha: 0.11 },
  { char: '词', left: 93, dur: 18, delay: 2,    size: 36, alpha: 0.14 },
  { char: '章', left: 35, dur: 26, delay: 8,    size: 20, alpha: 0.12 },
  { char: '魂', left: 55, dur: 24, delay: 6,    size: 30, alpha: 0.16 },
  { char: '剑', left: 3,  dur: 16, delay: 10,   size: 24, alpha: 0.10 },
  { char: '侠', left: 80, dur: 30, delay: 14,   size: 22, alpha: 0.10 },
  { char: '情', left: 48, dur: 21, delay: 4,    size: 28, alpha: 0.13 },
  { char: '义', left: 28, dur: 27, delay: 16,   size: 18, alpha: 0.10 },
  { char: '道', left: 68, dur: 15, delay: 11,   size: 34, alpha: 0.15 },
];

export function AuthLayout({ children }: { children: React.ReactNode }) {
  const { isDark } = useTheme();
  const [snippetIdx, setSnippetIdx] = useState(0);
  const [displayText, setDisplayText] = useState('');
  const [charIdx, setCharIdx] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  // 主题调色：浅色＝米纸墨字；深色＝青瓷夜色
  const P = isDark
    ? {
        pageBg: '#07070f', formBg: 'transparent',
        ambient: 'radial-gradient(ellipse 65% 55% at 20% 40%, rgba(30,140,138,0.28) 0%, transparent 65%), radial-gradient(ellipse 50% 65% at 78% 65%, rgba(55,25,100,0.18) 0%, transparent 60%), radial-gradient(ellipse 80% 25% at 50% 105%, rgba(20,100,98,0.12) 0%, transparent 55%)',
        rule: 'rgba(78,216,212,0.025)', watermark: 'rgba(78,216,212,0.025)',
        brand: 'linear-gradient(135deg, #1a9490 0%, #3acac8 40%, #80f0ee 70%, #2ab0ae 100%)',
        tagline: 'rgba(78,216,212,0.55)',
        cardBg: 'rgba(78,216,212,0.04)', cardBorder: 'rgba(78,216,212,0.13)',
        cardShadow: '0 8px 48px rgba(0,0,0,0.35), inset 0 1px 0 rgba(78,216,212,0.07)', cardBlur: 'blur(24px)',
        glowDot: '#4ed8d4', glowAnim: 'auth-glow-dark', cardLabel: 'rgba(78,216,212,0.45)',
        typeText: '#b0dedd', chip: 'rgba(80,160,158,0.4)', separator: 'rgba(78,216,212,0.22)',
        particle: (a: number) => `rgba(78,216,212,${a})`,
      }
    : {
        pageBg: '#f1e9d8', formBg: '#faf6ed',
        ambient: 'radial-gradient(ellipse 65% 55% at 20% 40%, rgba(217,119,6,0.12) 0%, transparent 65%), radial-gradient(ellipse 50% 65% at 78% 65%, rgba(146,64,14,0.08) 0%, transparent 60%), radial-gradient(ellipse 80% 25% at 50% 105%, rgba(180,83,9,0.07) 0%, transparent 55%)',
        rule: 'rgba(120,90,40,0.05)', watermark: 'rgba(74,60,40,0.05)',
        brand: 'linear-gradient(135deg, #92400e 0%, #b45309 35%, #d97706 65%, #92400e 100%)',
        tagline: '#9a8a68',
        cardBg: 'rgba(255,255,255,0.5)', cardBorder: 'rgba(120,90,40,0.18)',
        cardShadow: '0 8px 36px rgba(120,90,40,0.12), inset 0 1px 0 rgba(255,255,255,0.5)', cardBlur: 'blur(8px)',
        glowDot: '#d97706', glowAnim: 'auth-glow', cardLabel: '#a18a5e',
        typeText: '#4c463a', chip: '#a89878', separator: 'rgba(120,90,40,0.22)',
        particle: (a: number) => `rgba(74,60,40,${a})`,
      };

  useEffect(() => {
    const snippet = SNIPPETS[snippetIdx].text;
    let timer: ReturnType<typeof setTimeout>;

    if (!isDeleting) {
      if (charIdx < snippet.length) {
        timer = setTimeout(() => {
          setDisplayText(snippet.slice(0, charIdx + 1));
          setCharIdx(i => i + 1);
        }, 80);
      } else {
        timer = setTimeout(() => setIsDeleting(true), 3000);
      }
    } else {
      if (charIdx > 0) {
        timer = setTimeout(() => {
          setDisplayText(snippet.slice(0, charIdx - 1));
          setCharIdx(i => i - 1);
        }, 35);
      } else {
        setIsDeleting(false);
        setSnippetIdx(i => (i + 1) % SNIPPETS.length);
      }
    }

    return () => clearTimeout(timer);
  }, [charIdx, isDeleting, snippetIdx]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: P.pageBg }}>

      {/* ── Left artistic panel (desktop only) ────────────────────── */}
      <div
        className="hidden lg:flex flex-col"
        style={{
          width: '58%',
          position: 'relative',
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Ambient gradients */}
        <div style={{ position: 'absolute', inset: 0, background: P.ambient, pointerEvents: 'none' }} />

        {/* Subtle ruled-paper lines */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: `linear-gradient(${P.rule} 1px, transparent 1px)`,
          backgroundSize: '100% 52px',
          pointerEvents: 'none',
        }} />

        {/* Floating character particles */}
        {PARTICLES.map((p, i) => (
          <span
            key={i}
            className="auth-particle"
            style={{
              left: `${p.left}%`,
              bottom: '-60px',
              fontSize: `${p.size}px`,
              color: P.particle(p.alpha),
              animationDuration: `${p.dur}s`,
              animationDelay: `${p.delay}s`,
            }}
          >
            {p.char}
          </span>
        ))}

        {/* Giant watermark "墨" */}
        <div style={{
          position: 'absolute',
          fontSize: '52vw',
          maxWidth: '560px',
          color: P.watermark,
          fontFamily: 'Noto Serif SC, SimSun, serif',
          fontWeight: 900,
          top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          lineHeight: 1,
          pointerEvents: 'none', userSelect: 'none',
        }}>墨</div>

        {/* Main content */}
        <div style={{ position: 'relative', zIndex: 10, maxWidth: '460px', padding: '0 52px' }}>

          {/* Brand */}
          <div style={{ marginBottom: '52px' }}>
            <h1 style={{
              fontSize: '76px',
              fontWeight: 900,
              fontFamily: 'Noto Serif SC, SimSun, serif',
              background: P.brand,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              lineHeight: 1.05,
              margin: 0,
            }}>
              墨稿
            </h1>
            <p style={{
              color: P.tagline,
              fontSize: '12px',
              letterSpacing: '6px',
              marginTop: '8px',
              fontWeight: 300,
              textTransform: 'uppercase',
            }}>
              AI · 辅助小说创作平台
            </p>
          </div>

          {/* Typewriter card */}
          <div style={{
            background: P.cardBg,
            border: `1px solid ${P.cardBorder}`,
            borderRadius: '16px',
            padding: '28px 30px',
            backdropFilter: P.cardBlur,
            boxShadow: P.cardShadow,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <span style={{
                width: '7px', height: '7px', borderRadius: '50%',
                background: P.glowDot,
                display: 'inline-block',
                animation: `${P.glowAnim} 2.2s ease-in-out infinite`,
                flexShrink: 0,
              }} />
              <span style={{ color: P.cardLabel, fontSize: '11px', letterSpacing: '2.5px' }}>
                AI 正在创作 · {SNIPPETS[snippetIdx].genre}
              </span>
            </div>
            <p
              className="auth-typewriter"
              style={{
                color: P.typeText,
                fontFamily: 'Noto Serif SC, SimSun, serif',
                fontSize: '15px',
                lineHeight: 2,
                minHeight: '92px',
                margin: 0,
              }}
            >
              {displayText}
            </p>
          </div>

          {/* Feature chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', marginTop: '32px' }}>
            {['✦ 智能续写', '✦ 角色塑造', '✦ 情节分析', '✦ 风格优化', '✦ 世界构建'].map(f => (
              <span key={f} style={{ color: P.chip, fontSize: '12px', letterSpacing: '0.5px' }}>
                {f}
              </span>
            ))}
          </div>
        </div>

        {/* Right-edge separator */}
        <div style={{
          position: 'absolute', right: 0, top: 0, bottom: 0, width: '1px',
          background: `linear-gradient(to bottom, transparent 0%, ${P.separator} 25%, ${P.separator} 75%, transparent 100%)`,
        }} />
      </div>

      {/* ── Right form panel ───────────────────────────────────────── */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 32px',
        background: P.formBg,
      }}>
        <div style={{ width: '100%', maxWidth: '380px' }}>

          {/* Mobile-only logo */}
          <div className="lg:hidden" style={{ textAlign: 'center', marginBottom: '44px' }}>
            <h1 style={{
              fontSize: '58px',
              fontWeight: 900,
              fontFamily: 'Noto Serif SC, SimSun, serif',
              background: P.brand,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              lineHeight: 1.1, margin: 0,
            }}>墨稿</h1>
            <p style={{ color: P.tagline, fontSize: '11px', letterSpacing: '5px', marginTop: '6px' }}>
              AI · 辅助小说创作平台
            </p>
          </div>

          {children}
        </div>
      </div>
    </div>
  );
}
