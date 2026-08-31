"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Plus } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";

import CinematicHero from "@/components/CinematicHero";
import Composer from "@/components/Composer";
import ErrorState from "@/components/ErrorState";
import ItineraryView from "@/components/ItineraryView";
import JourneyScreen from "@/components/JourneyScreen";
import { StageIndicator } from "@/components/LoadingSkeleton";
import { DegradedNotice, UndoToast } from "@/components/Notices";
import RefineBar from "@/components/RefineBar";
import SessionsMenu from "@/components/SessionsMenu";
import ThemeToggle from "@/components/ThemeToggle";
import { useSessions } from "@/hooks/useSessions";
import { useTripPlanner } from "@/hooks/useTripPlanner";

export default function Home() {
  const { state, visible, dispatch, generate, refine, retry, cancel } = useTripPlanner();
  const { sessions, save, remove, isSaved } = useSessions();
  const workspaceRef = useRef<HTMLDivElement>(null);

  const isLoading = state.status === "loading";
  /** The cinematic landing only survives while there's genuinely nothing else to show. */
  const showHero = state.status === "idle" && !state.itinerary;
  /**
   * The journey takes the full screen only for a first generation. A refinement
   * keeps the itinerary on screen — yanking it away to show a loading animation
   * would lose the user's place in the thing they're editing.
   */
  const showJourney = isLoading && !state.itinerary;

  // Leaving the hero means leaving a 175vh scroll rig — start the workspace at
  // the top rather than wherever the hero happened to be scrolled to.
  useEffect(() => {
    if (!showHero) window.scrollTo({ top: 0, behavior: "auto" });
  }, [showHero]);

  const handleGenerate = useCallback(
    (prompt: string) => {
      void generate(prompt);
    },
    [generate],
  );

  const handleNewTrip = useCallback(() => {
    dispatch({ type: "session/reset" });
  }, [dispatch]);

  return (
    <>
      <AnimatePresence mode="wait">
        {showHero ? (
          <motion.div
            key="hero"
            exit={{ opacity: 0, filter: "blur(8px)" }}
            transition={{ duration: 0.35, ease: "easeIn" }}
          >
            <main id="main">
              <CinematicHero
                onSubmit={handleGenerate}
                onCancel={cancel}
                isLoading={isLoading}
              />

              {/* Below the stage: what the tool actually does. */}
              <section className="mx-auto max-w-3xl px-5 pb-28 pt-4 sm:px-8">
                <div className="grid gap-5 sm:grid-cols-3">
                  {[
                    {
                      title: "Structured, not chatty",
                      body: "The model returns JSON on a fixed schema. Your app renders components from it — there's no transcript to scroll.",
                    },
                    {
                      title: "Built for bad output",
                      body: "Truncated, fenced, or malformed responses get repaired and salvaged. A broken day costs you that day, not the trip.",
                    },
                    {
                      title: "Yours to rearrange",
                      body: "Drag stops between slots, move them across days, delete with undo, then refine the whole thing in a sentence.",
                    },
                  ].map((card, index) => (
                    <motion.article
                      key={card.title}
                      initial={{ opacity: 0, y: 18 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true, margin: "-80px" }}
                      transition={{
                        duration: 0.5,
                        delay: index * 0.08,
                        ease: [0.22, 1, 0.36, 1],
                      }}
                      className="rounded-[var(--radius-lg)] border border-border-subtle bg-surface p-4 backdrop-blur-xl"
                    >
                      <h3 className="text-[14px] font-semibold text-fg">{card.title}</h3>
                      <p className="mt-1.5 text-[13px] leading-relaxed text-fg-muted">
                        {card.body}
                      </p>
                    </motion.article>
                  ))}
                </div>
              </section>
            </main>

            <div className="no-print fixed right-4 top-4 z-40 flex items-center gap-2">
              <SessionsMenu
                sessions={sessions}
                onLoad={(itinerary) => dispatch({ type: "session/load", itinerary })}
                onRemove={remove}
              />
              <ThemeToggle />
            </div>
          </motion.div>
        ) : showJourney ? (
          <motion.div
            key="journey"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.02, filter: "blur(10px)" }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            <main id="main">
              <JourneyScreen
                stage={state.stage}
                preview={state.preview}
                prompt={state.lastRequest?.prompt ?? ""}
                onCancel={cancel}
              />
            </main>
          </motion.div>
        ) : (
          <motion.div
            key="workspace"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* --- Workspace header ------------------------------------------ */}
            <header className="no-print sticky top-0 z-30 border-b border-border-subtle bg-[color-mix(in_oklab,var(--bg)_78%,transparent)] backdrop-blur-xl">
              <div className="mx-auto flex h-16 max-w-4xl items-center gap-3 px-4 sm:px-6">
                <button
                  type="button"
                  onClick={handleNewTrip}
                  className="hero-display shrink-0 text-xl text-fg transition-opacity hover:opacity-70"
                >
                  Wanderly
                </button>

                <div className="ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleNewTrip}
                    className="inline-flex h-10 items-center gap-2 rounded-full border border-border-subtle bg-surface px-3.5 text-[13px] font-medium text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
                  >
                    <Plus size={14} strokeWidth={2.5} aria-hidden="true" />
                    <span className="hidden sm:inline">New trip</span>
                  </button>
                  <SessionsMenu
                    sessions={sessions}
                    onLoad={(itinerary) => dispatch({ type: "session/load", itinerary })}
                    onRemove={remove}
                  />
                  <ThemeToggle />
                </div>
              </div>
            </header>

            <main id="main" ref={workspaceRef} className="mx-auto max-w-4xl px-4 pb-8 pt-6 sm:px-6">
              {isLoading && (
                <div className="mb-5">
                  <StageIndicator stage={state.stage} />
                </div>
              )}

              <AnimatePresence>
                {state.degraded && (
                  <div className="mb-5">
                    <DegradedNotice
                      issues={state.issues}
                      repairs={state.repairs}
                      onDismiss={() => dispatch({ type: "notice/dismiss" })}
                    />
                  </div>
                )}
              </AnimatePresence>

              {state.status === "error" && state.error && (
                <div className="mb-5">
                  <ErrorState
                    error={state.error}
                    onRetry={() => void retry()}
                    onEdit={handleNewTrip}
                    isRetrying={false}
                  />
                </div>
              )}

              {visible && (
                <ItineraryView
                  itinerary={visible}
                  dispatch={dispatch}
                  onSave={() => state.itinerary && save(state.itinerary)}
                  isSaved={isSaved(state.itinerary?.id)}
                  isPreview={!state.itinerary}
                />
              )}

              {/* Nothing to show and nothing in flight — offer the input again. */}
              {!visible && !isLoading && (
                <div className="pt-2">
                  <Composer
                    onSubmit={handleGenerate}
                    onCancel={cancel}
                    isLoading={isLoading}
                    autoFocus
                  />
                </div>
              )}

              {state.itinerary && (
                <RefineBar onRefine={(text) => void refine(text)} onCancel={cancel} isLoading={isLoading} />
              )}
            </main>
          </motion.div>
        )}
      </AnimatePresence>

      <UndoToast
        label={state.lastRemoval?.label ?? null}
        onUndo={() => dispatch({ type: "edit/undo" })}
        onExpire={() => dispatch({ type: "edit/clearUndo" })}
      />
    </>
  );
}
