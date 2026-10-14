import {useCallback, useEffect, useRef} from 'react';
import {flushSync} from 'react-dom';

export const THEME_DURATION = 700;
export function rippleGeometry(x, y, width, height) {
  return {x, y, radius:Math.ceil(Math.hypot(Math.max(x,width-x),Math.max(y,height-y)))};
}
const effectiveTheme = theme => theme === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme;

export function useThemeTransition(theme, setTheme) {
  const active = useRef(null), generation = useRef(0), changeRef = useRef(null);
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => { document.documentElement.dataset.theme = effectiveTheme(theme); };
    apply(); media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);
  useEffect(() => () => { generation.current++; active.current?.skipTransition(); }, []);

  useEffect(() => {
    // Chromium can retarget pointer events to the root during a view snapshot.
    // Theme controls remain interruptible even while that snapshot is displayed.
    let suppressClickUntil = 0, suppressedPoint = null;
    const down = event => {
      if (!active.current || event.button !== 0 || event.target?.closest?.('[data-theme-choice]')) return;
      const button = [...document.querySelectorAll('[data-theme-choice]')].find(el => {
        if (el.closest('[inert]')) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom;
      });
      if (!button) return;
      event.preventDefault();
      suppressClickUntil = performance.now() + 450;
      suppressedPoint = {x:event.clientX,y:event.clientY};
      changeRef.current?.(button.dataset.themeChoice, {currentTarget:button});
    };
    const click = event => {
      if (performance.now() < suppressClickUntil && suppressedPoint && Math.hypot(event.clientX-suppressedPoint.x,event.clientY-suppressedPoint.y)<3) { event.preventDefault(); event.stopImmediatePropagation(); }
      suppressClickUntil = 0; suppressedPoint = null;
    };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('click', click, true);
    return () => { window.removeEventListener('pointerdown', down, true); window.removeEventListener('click', click, true); };
  }, []);

  const change = useCallback((next, event) => {
    const root = document.documentElement, version = ++generation.current;
    active.current?.skipTransition();
    const apply = () => {
      if (version !== generation.current) return;
      flushSync(() => setTheme(next));
      root.dataset.theme = effectiveTheme(next);
    };
    if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches || root.dataset.theme === effectiveTheme(next)) { root.classList.remove('theme-rippling'); apply(); return; }
    const rect = event?.currentTarget?.getBoundingClientRect();
    const {x,y,radius} = rippleGeometry(rect ? rect.left+rect.width/2 : innerWidth/2, rect ? rect.top+rect.height/2 : innerHeight/2, innerWidth, innerHeight);
    root.classList.add('theme-rippling');
    const transition = document.startViewTransition(apply);
    active.current = transition;
    transition.ready.then(() => {
      if (version !== generation.current) return;
      root.animate({clipPath:[`circle(0px at ${x}px ${y}px)`,`circle(${radius}px at ${x}px ${y}px)`]}, {duration:THEME_DURATION,easing:'cubic-bezier(.4,0,.2,1)',pseudoElement:'::view-transition-new(root)',fill:'both'});
    }).catch(() => {});
    transition.finished.finally(() => {
      if (version === generation.current) { active.current = null; root.classList.remove('theme-rippling'); }
    }).catch(() => {});
  }, [setTheme]);
  changeRef.current = change;
  return change;
}
