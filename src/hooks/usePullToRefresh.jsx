import { useEffect, useRef, useState } from 'react';

/**
 * Attaches pull-to-refresh behaviour to a scrollable container.
 * @param {Function} onRefresh - async callback to run on pull
 * @param {Object}   opts      - { threshold: px to trigger (default 70) }
 * @returns {{ containerRef, isPulling, pullDistance, isRefreshing }}
 */
export default function usePullToRefresh(onRefresh, { threshold = 70 } = {}) {
  const containerRef = useRef(null);
  const startYRef = useRef(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    const el = containerRef.current || window;

    const getScrollTop = () =>
      el === window ? window.scrollY : el.scrollTop;

    const onTouchStart = (e) => {
      if (getScrollTop() === 0) {
        startYRef.current = e.touches[0].clientY;
      }
    };

    const onTouchMove = (e) => {
      if (startYRef.current === null || isRefreshing) return;
      const delta = e.touches[0].clientY - startYRef.current;
      if (delta > 0) {
        setPullDistance(Math.min(delta, threshold * 1.5));
      }
    };

    const onTouchEnd = async () => {
      if (pullDistance >= threshold && !isRefreshing) {
        setIsRefreshing(true);
        setPullDistance(0);
        await onRefresh();
        setIsRefreshing(false);
      } else {
        setPullDistance(0);
      }
      startYRef.current = null;
    };

    const target = el === window ? document : el;
    target.addEventListener('touchstart', onTouchStart, { passive: true });
    target.addEventListener('touchmove', onTouchMove, { passive: true });
    target.addEventListener('touchend', onTouchEnd);

    return () => {
      target.removeEventListener('touchstart', onTouchStart);
      target.removeEventListener('touchmove', onTouchMove);
      target.removeEventListener('touchend', onTouchEnd);
    };
  }, [onRefresh, pullDistance, isRefreshing, threshold]);

  return {
    containerRef,
    isPulling: pullDistance > 0,
    pullDistance,
    isRefreshing,
  };
}