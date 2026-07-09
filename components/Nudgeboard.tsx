
import React from 'react';
import { useEngine } from '../lib/store';
import { Heart, User, CheckCircle, Zap, AlertCircle, Share2 } from 'lucide-react';

const Nudgeboard: React.FC = () => {
  const { feed, likeFeedItem, profile } = useEngine();

  const getActionConfig = (type: string) => {
    switch(type) {
      case 'SUCCESS': 
        return { 
          label: 'Win', 
          color: 'text-green-600', 
          bg: 'bg-green-50',
          icon: <CheckCircle size={12} strokeWidth={3} />,
          prefix: 'crushed'
        };
      case 'ACCEPTED': 
        return { 
          label: 'Intent', 
          color: 'text-blue-600', 
          bg: 'bg-blue-50',
          icon: <Zap size={12} strokeWidth={3} />,
          prefix: 'committed to'
        };
      case 'DECLINED':
        return { 
          label: 'Skip', 
          color: 'text-gray-400', 
          bg: 'bg-gray-50',
          icon: <AlertCircle size={12} strokeWidth={3} />,
          prefix: 'honestly skipped'
        };
      default: 
        return { 
          label: 'Action', 
          color: 'text-yellow-600', 
          bg: 'bg-yellow-50',
          icon: <Zap size={12} strokeWidth={3} />,
          prefix: 'interacted with'
        };
    }
  };

  const getTimeAgo = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    return '1d';
  };

  return (
    <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
      {feed.length === 0 ? (
        <div className="card card--flat text-center">
          <p className="text-sm text-muted">No team activity yet…</p>
        </div>
      ) : (
        feed.map(item => {
          const config = getActionConfig(item.type);
          const isMe = item.userName === profile.name;

          return (
            <div key={item.id} className="challenge-card">
              <div className="challenge-card__meta">
                <span className="tag tag--time">{getTimeAgo(item.timestamp)} ago</span>
                <span className="tag tag--yellow">{config.label}</span>
              </div>

              <div className="flex items-center gap-4 mt-2">
                <div className="icon-badge icon-badge--sm" style={{ marginBottom: 0 }}>
                  {item.userName.substring(0, 2).toUpperCase()}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold text-primary truncate">
                      {item.userName} {isMe && <span className="text-xs text-muted">(you)</span>}
                    </span>
                  </div>

                  <p className="text-sm text-secondary leading-snug">
                    <span className="font-semibold">{config.prefix}</span> “{item.actionTitle}”
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <button
                    onClick={() => likeFeedItem(item.id)}
                    className="btn btn--icon"
                    aria-label="Like activity"
                  >
                    <Heart
                      size={16}
                      className={item.likes > 0 ? "text-red-500 fill-current" : "text-muted"}
                      strokeWidth={2.5}
                    />
                  </button>
                  {item.likes > 0 && (
                    <span className="text-xs text-muted">{item.likes}</span>
                  )}

                  <button
                    className="btn btn--icon hidden sm:inline-flex"
                    aria-label="Share"
                  >
                    <Share2 size={16} strokeWidth={2.5} />
                  </button>
                </div>
              </div>
            </div>
          );
        })
      )}
      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #f1f5f9; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #c9a000; border-radius: 10px; }
      `}} />
    </div>
  );
};

export default Nudgeboard;
