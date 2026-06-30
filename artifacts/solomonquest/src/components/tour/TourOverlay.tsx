import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { X, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { getTourSteps, getTourKey, type UserRole } from "./tourData";

interface TourOverlayProps {
  role?: UserRole | null;
  onClose: () => void;
}

export function TourOverlay({ role, onClose }: TourOverlayProps) {
  const steps = getTourSteps(role);
  const [currentStep, setCurrentStep] = useState(0);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [animating, setAnimating] = useState(false);
  const [visible, setVisible] = useState(false);

  // Fade in on mount
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 30);
    return () => clearTimeout(t);
  }, []);

  const goTo = useCallback(
    (next: number, dir: "forward" | "back") => {
      if (animating) return;
      setDirection(dir);
      setAnimating(true);
      setTimeout(() => {
        setCurrentStep(next);
        setAnimating(false);
      }, 280);
    },
    [animating]
  );

  const handleNext = () => {
    if (currentStep < steps.length - 1) goTo(currentStep + 1, "forward");
    else handleClose();
  };

  const handlePrev = () => {
    if (currentStep > 0) goTo(currentStep - 1, "back");
  };

  const handleClose = useCallback(() => {
    setVisible(false);
    setTimeout(() => {
      localStorage.setItem(getTourKey(role), "true");
      onClose();
    }, 300);
  }, [role, onClose]);

  const step = steps[currentStep];
  const isLast = currentStep === steps.length - 1;

  const slideClass = animating
    ? direction === "forward"
      ? "opacity-0 translate-x-8"
      : "opacity-0 -translate-x-8"
    : "opacity-100 translate-x-0";

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{
        background: "rgba(0,0,0,0.75)",
        backdropFilter: "blur(4px)",
        opacity: visible ? 1 : 0,
        transition: "opacity 0.3s ease",
      }}
    >
      <div
        className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden"
        style={{
          transform: visible ? "scale(1)" : "scale(0.92)",
          transition: "transform 0.35s cubic-bezier(.22,.68,0,1.2)",
        }}
      >
        {/* Header gradient bar */}
        <div className="h-1.5 bg-gradient-to-r from-primary via-blue-500 to-purple-500" />

        {/* Top row: step counter + skip */}
        <div className="flex items-center justify-between px-6 pt-5 pb-1">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-xs font-semibold text-primary uppercase tracking-widest">
              Quick Tour
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400">
              {currentStep + 1} / {steps.length}
            </span>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              aria-label="Close tour"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Illustration */}
        <div className="mx-6 mt-3 h-44 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl overflow-hidden border border-gray-100">
          <div
            className={`h-full p-4 transition-all duration-280 ease-out ${slideClass}`}
          >
            {step.illustration}
          </div>
        </div>

        {/* Text */}
        <div className={`px-6 pt-5 pb-2 transition-all duration-280 ease-out ${slideClass}`}>
          <h2 className="text-xl font-bold text-gray-900 mb-2">{step.title}</h2>
          <p className="text-sm text-gray-600 leading-relaxed">{step.description}</p>
          {step.tip && (
            <div className="mt-3 flex items-start gap-2 bg-primary/5 border border-primary/10 rounded-lg px-3 py-2">
              <span className="text-primary text-sm mt-0.5 shrink-0">💡</span>
              <p className="text-xs text-primary/80">{step.tip}</p>
            </div>
          )}
        </div>

        {/* Progress dots */}
        <div className="flex justify-center gap-1.5 py-4">
          {steps.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i, i > currentStep ? "forward" : "back")}
              className={`rounded-full transition-all duration-200 ${
                i === currentStep
                  ? "w-5 h-2 bg-primary"
                  : "w-2 h-2 bg-gray-200 hover:bg-gray-300"
              }`}
              aria-label={`Go to step ${i + 1}`}
            />
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between px-6 pb-6 gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 text-xs"
          >
            Skip Tour
          </Button>
          <div className="flex gap-2">
            {currentStep > 0 && (
              <Button variant="outline" size="sm" onClick={handlePrev}>
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
            )}
            <Button size="sm" onClick={handleNext} className="px-5">
              {isLast ? (
                "Get Started 🚀"
              ) : (
                <>
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export function useTour(role?: UserRole | null) {
  const [showTour, setShowTour] = useState(false);

  useEffect(() => {
    if (!role) return;
    const key = getTourKey(role);
    const done = localStorage.getItem(key);
    if (!done) {
      // Small delay so layouts render first
      const t = setTimeout(() => setShowTour(true), 800);
      return () => clearTimeout(t);
    }
  }, [role]);

  const launchTour = () => setShowTour(true);
  const closeTour = () => setShowTour(false);

  return { showTour, launchTour, closeTour };
}
