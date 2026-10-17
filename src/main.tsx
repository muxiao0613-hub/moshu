import { Component, StrictMode } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './styles.css';
import {PetWindow} from './platform/pet/PetWindow';
const petSurface=new URLSearchParams(window.location.search).get('surface')==='desktop-pet';
if(petSurface)document.documentElement.dataset.surface='desktop-pet';

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { /* Never log user content. */ }
  render() {
    if (this.state.failed) return <main className="page-content"><h1>页面暂时无法显示</h1><p>请重新启动应用。已确认保存的内容保留在本机；当前未保存稿件的恢复服务将在后续阶段补齐。</p></main>;
    return this.props.children;
  }
}
const root = document.getElementById('root');
if (root) createRoot(root).render(<StrictMode><ErrorBoundary>{petSurface?<PetWindow/>:<App/>}</ErrorBoundary></StrictMode>);
