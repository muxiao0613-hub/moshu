import { useState, useEffect } from 'react';

/**
 * 响应式断点 hook。仅用于必须由 JS 决定的场景（如面板初始展开态）；
 * 纯样式响应式请优先用 Tailwind 的 md: / lg: 前缀。
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

/** 是否为移动端宽度（< 768px，对应 Tailwind md 断点）。 */
export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 767px)');
}
