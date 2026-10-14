import React, { useEffect, useRef } from 'react';
import { animate, motion, useIsPresent, useMotionValue, useReducedMotion } from 'motion/react';
import { Tooltip } from './ui-controls.jsx';
import { dragAxis, installAxisScroll } from './scroll-axis.js';

export const SPRING = { type:'spring', stiffness:330, damping:36, mass:1 };
export const SOFT_SPRING = { type:'spring', stiffness:260, damping:32, mass:1 };
export const FADE = { duration:.18, ease:'easeOut' };
export function useTransition() { return useReducedMotion() ? { duration:.12 } : SPRING; }
export function PressButton({ children, className='', tip, title, tipPlacement='top', tipRail=false, ...props }) {
  const reduced = useReducedMotion();
  const button=<motion.button type="button" whileTap={reduced||props.disabled ? undefined : {scale:.95}} transition={SPRING} className={className} {...props}>{children}</motion.button>;
  return tip||title?<Tooltip content={tip||title} placement={tipPlacement} rail={tipRail}>{button}</Tooltip>:button;
}

// A ref-counted lock survives the brief overlap between entering and exiting dialogs.
let bodyLocks = 0;
let previousOverflow = '';
export function useDialogFocus(ref) {
  const present = useIsPresent();
  useEffect(() => {
    if (bodyLocks++ === 0) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    return () => { if (--bodyLocks === 0) document.body.style.overflow = previousOverflow; };
  }, []);
  useEffect(() => {
    if (!present) return;
    const dialog = ref.current;
    const previous = document.activeElement;
    const previousLabel = previous?.getAttribute('aria-label');
    dialog?.focus({ preventScroll:true });
    const trap = e => {
      if (e.key !== 'Tab') return;
      const controls = Array.from(dialog.querySelectorAll('button:not(:disabled),input,select,[tabindex="0"]')).filter(el => el.getClientRects().length);
      if (!controls.length) return;
      if (e.shiftKey && (document.activeElement === controls[0] || document.activeElement === dialog)) { e.preventDefault(); controls.at(-1).focus(); }
      else if (!e.shiftKey && (document.activeElement === controls.at(-1) || document.activeElement === dialog)) { e.preventDefault(); controls[0].focus(); }
    };
    dialog?.addEventListener('keydown', trap);
    return () => {
      dialog?.removeEventListener('keydown', trap);
      // Wait for React to release background inertness, or mount the next dialog.
      requestAnimationFrame(()=>{
        const active=document.activeElement;
        if(active!==document.body&&!dialog?.contains(active)&&!active?.closest('[inert]'))return;
        const available=el=>el?.isConnected&&!el.closest('[inert]')&&el.getClientRects().length;
        const target=available(previous)?previous:previousLabel?Array.from(document.querySelectorAll('button[aria-label]')).find(el=>el.getAttribute('aria-label')===previousLabel&&available(el)):null;
        const fallback=document.querySelector('.desktop-search');
        if(available(target))target.focus({preventScroll:true});
        else if(available(fallback))fallback.focus({preventScroll:true});
      });
    };
  }, [present]);
  return present;
}

export function usePageScrollLock(ref,mode) {
  useEffect(()=>{if(ref.current&&mode)return installAxisScroll(ref.current,mode);},[mode]);
}

// Vertical touch panning stays native; horizontal drags share the arrow spring.
export function useKineticRail(ref) {
  const reduced = useReducedMotion();
  const position = useMotionValue(0);
  const flight = useRef(null);
  const target = useRef(0);
  const pointer = useRef(null);
  const suppressClick = useRef(false);
  useEffect(() => position.on('change', value => {
    if (ref.current) ref.current.scrollLeft = value;
  }), [position]);
  function stop() { flight.current?.stop(); flight.current = null; }
  function clamp(value) { const el = ref.current; return Math.max(0, Math.min(value, el.scrollWidth - el.clientWidth)); }
  function settle(next, velocity) {
    const el = ref.current;
    if (!el) return;
    const previousFlight = flight.current;
    stop();
    if (!previousFlight) position.jump(el.scrollLeft);
    target.current = clamp(next);
    if (reduced) { position.jump(target.current); return; }
    const options = { type:'spring', stiffness:125, damping:25, restDelta:.5, restSpeed:5 };
    if (velocity !== undefined) options.velocity = velocity;
    flight.current = animate(position, target.current, { ...options, onComplete:() => { flight.current = null; } });
  }
  function move(direction) {
    const el = ref.current;
    if (el) settle((flight.current ? target.current : el.scrollLeft) + direction * el.clientWidth * .8);
  }
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const interrupt = () => { stop(); position.jump(el.scrollLeft); };
    el.addEventListener('wheel', interrupt, { passive:true });
    el.addEventListener('touchstart', interrupt, { passive:true });
    document.addEventListener('rail-scroll-interrupt',interrupt);
    return () => { stop(); el.removeEventListener('wheel', interrupt); el.removeEventListener('touchstart', interrupt); document.removeEventListener('rail-scroll-interrupt',interrupt); };
  }, []);
  useEffect(() => { if (reduced) stop(); }, [reduced]);
  function finish(e) {
    const drag = pointer.current;
    if (!drag || drag.id !== e.pointerId) return;
    pointer.current = null;
    const el = ref.current;
    el?.classList.remove('is-dragging');
    if (el?.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    if (!drag.active || !el) return;
    const velocity = e.timeStamp - drag.time > 90 ? 0 : drag.velocity;
    const destinations = Array.from(el.querySelectorAll('.title-card')).map(card => card.offsetLeft - parseFloat(getComputedStyle(el).paddingLeft));
    const projected = clamp(el.scrollLeft + velocity * .19);
    const nearest = destinations.length ? destinations.reduce((a,b) => Math.abs(b-projected) < Math.abs(a-projected) ? b : a) : projected;
    position.jump(el.scrollLeft);
    settle(nearest, velocity);
  }
  return { move, bindings:{
    onPointerDown:e => {
      if (!e.isPrimary || e.button !== 0 || e.target.closest('.card-bookmark')) return;
      stop(); suppressClick.current = false;
      pointer.current = { id:e.pointerId, start:e.clientX, startY:e.clientY, axis:null, left:ref.current.scrollLeft, x:e.clientX, time:e.timeStamp, velocity:0, active:false };
    },
    onPointerMove:e => {
      const drag = pointer.current;
      if (!drag || drag.id !== e.pointerId) return;
      const delta = e.clientX - drag.start;
      drag.axis ||= dragAxis(delta,e.clientY-drag.startY);
      if(!drag.axis)return;
      if(drag.axis==='y'){document.dispatchEvent(new Event('rail-scroll-interrupt'));return;}
      const el = ref.current;
      if (!drag.active) { drag.active = true; suppressClick.current = true; el.classList.add('is-dragging'); el.setPointerCapture(e.pointerId); }
      e.preventDefault();
      const elapsed = Math.max(1, e.timeStamp - drag.time);
      const velocity = (drag.x - e.clientX) / elapsed * 1000;
      drag.velocity = Math.max(-3000, Math.min(3000, drag.velocity * .35 + velocity * .65));
      drag.x = e.clientX; drag.time = e.timeStamp;
      el.scrollLeft = clamp(drag.left - delta);
    },
    onPointerUp:finish,
    onPointerCancel:e => { if (pointer.current) pointer.current.velocity = 0; finish(e); },
    onLostPointerCapture:e => { if (pointer.current) finish(e); },
    onClickCapture:e => { if (suppressClick.current) { e.preventDefault(); e.stopPropagation(); suppressClick.current = false; } },
    onDragStart:e => e.preventDefault(),
    onKeyDown:e => { if (e.target === ref.current && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); move(e.key === 'ArrowLeft' ? -1 : 1); } },
  }};
}
