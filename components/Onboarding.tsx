
import React, { useState } from 'react';
import { useEngine } from '../lib/store';

const Onboarding: React.FC = () => {
  const { completeOnboarding } = useEngine();
  const [step, setStep] = useState(1);
  const [importance, setImportance] = useState(5);
  const [goal, setGoal] = useState(3);

  const handleNext = () => {
    if (step < 2) setStep(step + 1);
    else completeOnboarding(importance, goal);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
      <div className="page-bg w-full h-full absolute inset-0 pointer-events-none opacity-60" />
      <div className="card animate-pop w-full max-w-sm text-center">
        {step === 1 ? (
          <div className="animate-in fade-in zoom-in duration-300">
            <div className="icon-badge icon-badge--sm">✨</div>
            <h2 className="detail-panel__title mb-2">The Social Contract</h2>
            <p className="text-sm text-secondary mb-8">
              How critical is professional growth to your success?
            </p>
            
            <div className="flex flex-col gap-4 mb-8">
              <input
                type="range" min="1" max="10"
                className="w-full h-4 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-black"
                value={importance}
                onChange={e => setImportance(parseInt(e.target.value))}
              />
              <div className="text-5xl font-bold text-primary">{importance}</div>
            </div>
          </div>
        ) : (
          <div className="animate-in fade-in zoom-in duration-300">
            <div className="icon-badge icon-badge--sm">🎯</div>
            <h2 className="detail-panel__title mb-2">Weekly Intent</h2>
            <p className="text-sm text-secondary mb-8">
              Commit to a volume that bridges the gap without burning out.
            </p>
            
            <div className="flex justify-center gap-4 mb-8">
              {[1, 3, 5].map(v => (
                <button
                  key={v}
                  onClick={() => setGoal(v)}
                  className={`w-14 h-14 rounded-full text-xl font-bold border ${goal === v ? 'btn btn--primary-dark text-white' : 'bg-white text-primary'}`}
                >
                  {v}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted font-semibold">Actions per week</p>
          </div>
        )}

        <button 
          onClick={handleNext}
          className="btn btn--primary btn--full mt-4"
        >
          {step === 1 ? 'Commit & Continue' : 'Enter the Engine'}
        </button>
      </div>
    </div>
  );
};

export default Onboarding;
