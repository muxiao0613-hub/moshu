import { createContext, useContext, useState } from 'react';

interface OnboardingCtx {
  step: number; // -1 = done / inactive
  advance: () => void;
  skip: () => void;
  restart: () => void;
}

const Ctx = createContext<OnboardingCtx>({
  step: -1,
  advance: () => {},
  skip: () => {},
  restart: () => {},
});

// 3 steps: 0=create project, 1=api key, 2=ai generate
const TOTAL = 3;

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [step, setStep] = useState<number>(() => {
    if (localStorage.getItem('mogao_onboarded')) return -1;
    return parseInt(localStorage.getItem('mogao_guide_step') || '0');
  });

  const advance = () => {
    if (step < 0) return;
    const next = step + 1;
    if (next >= TOTAL) {
      localStorage.setItem('mogao_onboarded', '1');
      localStorage.removeItem('mogao_guide_step');
      setStep(-1);
    } else {
      localStorage.setItem('mogao_guide_step', String(next));
      setStep(next);
    }
  };

  const skip = () => {
    localStorage.setItem('mogao_onboarded', '1');
    localStorage.removeItem('mogao_guide_step');
    setStep(-1);
  };

  const restart = () => {
    localStorage.removeItem('mogao_onboarded');
    localStorage.setItem('mogao_guide_step', '0');
    setStep(0);
  };

  return <Ctx.Provider value={{ step, advance, skip, restart }}>{children}</Ctx.Provider>;
}

export const useOnboarding = () => useContext(Ctx);
