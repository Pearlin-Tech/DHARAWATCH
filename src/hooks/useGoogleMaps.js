import { useState, useEffect } from 'react';

export function useGoogleMaps(apiKey) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!apiKey) {
      setError(new Error('GOOGLE MAPS API KEY REQUIRED'));
      return;
    }

    if (window.google && window.google.maps) {
      setLoaded(true);
      return;
    }

    const existingScript = document.getElementById('google-maps-script');
    if (existingScript) {
      existingScript.addEventListener('load', () => setLoaded(true));
      existingScript.addEventListener('error', (e) => setError(new Error('GOOGLE MAPS FAILED TO LOAD')));
      return;
    }

    const script = document.createElement('script');
    script.id = 'google-maps-script';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.defer = true;
    
    script.onload = () => setLoaded(true);
    script.onerror = () => setError(new Error('GOOGLE MAPS FAILED TO LOAD'));
    
    document.head.appendChild(script);

    return () => {
    };
  }, [apiKey]);

  return { loaded, error, retry: () => { setError(null); setLoaded(false); } };
}
