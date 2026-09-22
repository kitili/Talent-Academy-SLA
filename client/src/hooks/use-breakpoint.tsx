import { useState, useEffect } from 'react';

type Breakpoint = 'mobile' | 'tablet' | 'desktop' | 'wide';

interface BreakpointInfo {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isWide: boolean;
  current: Breakpoint;
  width: number;
}

export function useBreakpoint(): BreakpointInfo {
  const [breakpoint, setBreakpoint] = useState<BreakpointInfo>(() => 
    getBreakpoint(typeof window !== 'undefined' ? window.innerWidth : 1024)
  );

  useEffect(() => {
    const handleResize = () => {
      setBreakpoint(getBreakpoint(window.innerWidth));
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return breakpoint;
}

function getBreakpoint(width: number): BreakpointInfo {
  if (width < 768) {
    return {
      isMobile: true,
      isTablet: false,
      isDesktop: false,
      isWide: false,
      current: 'mobile',
      width,
    };
  } else if (width < 1024) {
    return {
      isMobile: false,
      isTablet: true,
      isDesktop: false,
      isWide: false,
      current: 'tablet',
      width,
    };
  } else if (width < 1440) {
    return {
      isMobile: false,
      isTablet: false,
      isDesktop: true,
      isWide: false,
      current: 'desktop',
      width,
    };
  } else {
    return {
      isMobile: false,
      isTablet: false,
      isDesktop: false,
      isWide: true,
      current: 'wide',
      width,
    };
  }
}
