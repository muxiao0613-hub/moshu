import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthContext';
import { AuthLayout } from '@/features/auth/AuthLayout';
import { useTheme } from '@/shared/contexts/ThemeContext';
import { getHttpErrorMessage } from '@/shared/lib/utils';

const authPalette = (isDark: boolean) => isDark
  ? { head: '#e8f0ef', sub: 'rgba(78,216,212,0.5)', label: 'rgba(78,216,212,0.65)', faint: 'rgba(78,216,212,0.35)',
      errC: '#fca5a5', errBg: 'rgba(220,38,38,0.09)', errBd: 'rgba(220,38,38,0.3)',
      hover: 'rgba(78,216,212,0.32)', foot: 'rgba(78,216,212,0.38)', link: '#4ed8d4', tag: 'rgba(78,216,212,0.18)' }
  : { head: '#2b2620', sub: '#9a8a68', label: '#6b6253', faint: '#a89c84',
      errC: '#b91c1c', errBg: 'rgba(190,30,30,0.08)', errBd: 'rgba(190,30,30,0.3)',
      hover: 'rgba(217,119,6,0.3)', foot: '#a89c84', link: '#b45309', tag: '#bdae90' };

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const { isDark } = useTheme();
  const T = authPalette(isDark);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(getHttpErrorMessage(err, {
        auth: '邮箱或密码错误，请重新输入',
        server: '服务器异常，请稍后重试',
        network: '网络连接失败，请检查网络后重试',
      }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      {/* Header */}
      <div style={{ marginBottom: '36px' }}>
        <h2 style={{ color: T.head, fontSize: '26px', fontWeight: 600, margin: '0 0 8px' }}>
          欢迎回来
        </h2>
        <p style={{ color: T.sub, fontSize: '14px', margin: 0 }}>
          续写你的故事，从这里开始
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div>
          <label style={{ display: 'block', color: T.label, fontSize: '12px', letterSpacing: '1px', marginBottom: '8px' }}>
            邮箱地址
          </label>
          <input
            className="auth-input"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            placeholder="your@email.com"
          />
        </div>

        <div>
          <label style={{ display: 'block', color: T.label, fontSize: '12px', letterSpacing: '1px', marginBottom: '8px' }}>
            密码
          </label>
          <input
            className="auth-input"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            placeholder="••••••••"
          />
        </div>

        {error && (
          <div style={{
            padding: '11px 14px',
            background: T.errBg,
            border: `1px solid ${T.errBd}`,
            borderRadius: '10px',
            color: T.errC,
            fontSize: '13px',
          }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="auth-btn-gold"
          style={{
            padding: '13px',
            borderRadius: '10px',
            border: 'none',
            color: '#052020',
            fontWeight: 700,
            fontSize: '15px',
            letterSpacing: '1.5px',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.65 : 1,
            marginTop: '4px',
            transition: 'transform 0.2s, box-shadow 0.2s',
          }}
          onMouseEnter={e => {
            if (!loading) {
              (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-2px)';
              (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 10px 28px ${T.hover}`;
            }
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)';
            (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none';
          }}
        >
          {loading ? '正在进入世界……' : '开始创作'}
        </button>
      </form>

      {/* Footer link */}
      <p style={{ marginTop: '28px', textAlign: 'center', fontSize: '13px' }}>
        <span style={{ color: T.foot }}>还没有账号？</span>
        {' '}
        <Link
          to="/register"
          style={{ color: T.link, textDecoration: 'none', fontWeight: 500 }}
          onMouseEnter={e => ((e.target as HTMLElement).style.textDecoration = 'underline')}
          onMouseLeave={e => ((e.target as HTMLElement).style.textDecoration = 'none')}
        >
          立即加入墨稿
        </Link>
      </p>

      {/* Decorative tagline */}
      <div style={{ marginTop: '44px', textAlign: 'center', color: T.tag, fontSize: '11px', letterSpacing: '3px' }}>
        ◆ 每一个故事，都值得被书写 ◆
      </div>
    </AuthLayout>
  );
}
