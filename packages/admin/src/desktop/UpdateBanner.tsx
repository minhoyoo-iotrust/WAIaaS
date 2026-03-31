import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { checkForUpdate, installUpdate } from './update-checker';
import type { UpdateInfo } from './update-checker';

const styles = {
  banner: {
    background: '#2563eb',
    color: 'white',
    padding: '8px 16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: '14px',
    fontFamily: 'var(--font-family-sans, system-ui, sans-serif)',
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  updateBtn: {
    background: 'white',
    color: '#2563eb',
    border: 'none',
    borderRadius: '4px',
    padding: '4px 12px',
    cursor: 'pointer',
    fontWeight: '600' as const,
    fontSize: '13px',
  },
  laterBtn: {
    background: 'transparent',
    color: 'rgba(255,255,255,0.8)',
    border: 'none',
    cursor: 'pointer',
    fontSize: '13px',
    textDecoration: 'underline',
  },
  progressTrack: {
    width: '200px',
    height: '4px',
    background: 'rgba(255,255,255,0.3)',
    borderRadius: '2px',
  },
} as const;

export function UpdateBanner() {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [status, setStatus] = useState<'idle' | 'available' | 'downloading' | 'done'>('idle');
  const [progress, setProgress] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    checkForUpdate().then((update) => {
      if (update) {
        setInfo(update);
        setStatus('available');
      }
    });
  }, []);

  if (status === 'idle' || dismissed || !info) return null;

  const handleUpdate = async () => {
    setStatus('downloading');
    try {
      await installUpdate((p) => setProgress(p));
      setStatus('done');
    } catch (e) {
      console.error('[updater] install failed:', e);
      setStatus('available');
    }
  };

  return (
    <div style={styles.banner}>
      {status === 'available' && (
        <>
          <span>New version {info.version} is available</span>
          <div style={styles.actions}>
            <button onClick={handleUpdate} style={styles.updateBtn}>
              Update now
            </button>
            <button onClick={() => setDismissed(true)} style={styles.laterBtn}>
              Later
            </button>
          </div>
        </>
      )}
      {status === 'downloading' && (
        <>
          <span>Downloading update... {progress}%</span>
          <div style={styles.progressTrack}>
            <div
              style={{
                width: `${progress}%`,
                height: '100%',
                background: 'white',
                borderRadius: '2px',
                transition: 'width 0.2s ease',
              }}
            />
          </div>
        </>
      )}
      {status === 'done' && <span>Update installed. Restarting...</span>}
    </div>
  );
}
