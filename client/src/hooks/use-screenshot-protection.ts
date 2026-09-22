import { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/queryClient';

export function useScreenshotProtection(weekId: string | undefined) {
  const [showWarning, setShowWarning] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Detect common screenshot shortcuts
      const isScreenshot = 
        e.key === 'PrintScreen' ||
        (e.metaKey && e.shiftKey && (e.key === '3' || e.key === '4' || e.key === '5')) || // macOS
        (e.metaKey && e.shiftKey && e.key === 's') || // macOS Safari
        (e.ctrlKey && e.key === 'PrintScreen') || // Windows
        (e.altKey && e.key === 'PrintScreen'); // Windows Alt+PrtScn

      if (isScreenshot) {
        e.preventDefault();
        e.stopPropagation();
        
        // Show warning overlay
        setShowWarning(true);
        
        // Log security violation to backend
        if (weekId) {
          apiRequest('POST', '/api/security/log-violation', {
            weekId,
            violationType: 'screenshot_attempt',
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent,
          }).catch(err => console.error('Failed to log security violation:', err));
        }
        
        // Hide warning after 5 seconds
        setTimeout(() => setShowWarning(false), 5000);
      }
    };

    // Add event listener
    document.addEventListener('keydown', handleKeyDown, true);

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [weekId]);

  return { showWarning, dismissWarning: () => setShowWarning(false) };
}
