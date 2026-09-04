"use client";

import * as React from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger, useGSAP);

type Cleanup = () => void;

/**
 * A page-relative box. Storing the document offset instead of the viewport rect
 * means pointer maths only has to subtract the current scroll, so nothing has to
 * re-measure (and force layout) on every scroll event.
 */
function pageBox(element: Element) {
  const rect = element.getBoundingClientRect();
  return {
    top: rect.top + window.scrollY,
    left: rect.left + window.scrollX,
    width: rect.width,
    height: rect.height,
  };
}

/**
 * Center-to-center offset between two elements, from layout boxes rather than
 * getBoundingClientRect(). The desk is a 3D scene and the moving element carries
 * its own transform, so client rects would measure from wherever the element
 * currently is and drift on every re-measure. Both elements must share an
 * offsetParent, which every absolutely-positioned child of the desk world does.
 */
function layoutOffsetBetween(from: HTMLElement, target: HTMLElement) {
  return {
    x: target.offsetLeft + target.offsetWidth / 2 - (from.offsetLeft + from.offsetWidth / 2),
    y: target.offsetTop + target.offsetHeight / 2 - (from.offsetTop + from.offsetHeight / 2),
  };
}

/** Hero headline, the desk scene, section reveals, ticker, tilt and parallax. */
export function useLandingMotion(scope: React.RefObject<HTMLElement | null>) {
  useGSAP(
    (_context, contextSafe) => {
      const root = scope.current;
      if (!root) return;

      const q = <T extends Element>(selector: string, parent: ParentNode = root) =>
        gsap.utils.toArray<T>(parent.querySelectorAll(selector));

      const mm = gsap.matchMedia(root);
      const cleanups: Cleanup[] = [];

      mm.add(
        {
          isDesktop: "(min-width: 901px)",
          isMobile: "(max-width: 900px)",
          reduceMotion: "(prefers-reduced-motion: reduce)",
        },
        (media) => {
          const { isDesktop, reduceMotion } = media.conditions as {
            isDesktop: boolean;
            isMobile: boolean;
            reduceMotion: boolean;
          };

          // Reduced motion: make sure everything the motion layer would hide is visible.
          if (reduceMotion) {
            gsap.set(q("[data-reveal], [data-stagger-item], [data-hero-word] > span"), {
              autoAlpha: 1,
              y: 0,
              yPercent: 0,
              clearProps: "transform",
            });
            return;
          }

          // ── Hero intro ────────────────────────────────────────────────────
          // Animate the INNER span so the parent's overflow-hidden acts as a mask.
          const heroWords = q<HTMLElement>("[data-hero-word] > span");
          gsap
            .timeline({ defaults: { ease: "power3.out" } })
            .from(q("[data-hero-mark]"), { autoAlpha: 0, y: 14, duration: 0.6 })
            .from(q("[data-hero-eyebrow]"), { autoAlpha: 0, y: 16, duration: 0.6 }, "-=0.4")
            .from(heroWords, { yPercent: 118, duration: 1, stagger: 0.08, ease: "expo.out" }, "-=0.3")
            .from(q("[data-hero-copy]"), { autoAlpha: 0, y: 20, duration: 0.7 }, "-=0.72")
            .from(q("[data-hero-actions]"), { autoAlpha: 0, y: 16, duration: 0.6 }, "-=0.45")
            .from(q("[data-hero-visual]"), { autoAlpha: 0, duration: 1.4, ease: "power2.out" }, 0.2);

          // ── Desk scene ────────────────────────────────────────────────────
          // The desk is an absolutely-positioned hero background inside an
          // overflow:hidden section, so it can't be pinned. Drive the camera
          // from the hero's own scroll range instead, and run the signal story
          // as a self-contained ambient loop.
          const desk = root.querySelector<HTMLElement>("[data-desk-scene]");
          const heroSection = desk?.closest("section");

          if (desk && heroSection && isDesktop) {
            const camera = desk.querySelector<HTMLElement>("[data-desk-camera]");
            const world = desk.querySelector<HTMLElement>("[data-desk-world]");
            const wash = heroSection.querySelector<HTMLElement>(".hero-desk-wash");
            const signalMonitor = desk.querySelector<HTMLElement>('[data-desk-focus="signal"]');
            const executionMonitor = desk.querySelector<HTMLElement>('[data-desk-focus="execution"]');
            const marketMonitor = desk.querySelector<HTMLElement>('[data-desk-focus="market"]');
            const brokerRail = desk.querySelector<HTMLElement>(".trading-desk__broker-rail");
            const routePath = desk.querySelector<SVGPathElement>("[data-desk-route-path]");
            const scan = desk.querySelector<HTMLElement>("[data-desk-scan]");
            const pulse = desk.querySelector<HTMLElement>("[data-desk-pulse]");
            const callouts = {
              signal: desk.querySelector<HTMLElement>('[data-desk-callout="signal"]'),
              risk: desk.querySelector<HTMLElement>('[data-desk-callout="risk"]'),
              route: desk.querySelector<HTMLElement>('[data-desk-callout="route"]'),
            };
            const monitors = [marketMonitor, signalMonitor, executionMonitor].filter(
              Boolean,
            ) as HTMLElement[];

            // The desk is a real 3D stage: every layer already sits at its own
            // translateZ in CSS (wall -180px, monitors +28/+82/+34px, route +60px,
            // pulse +100px) under a shared `perspective`. So moving the *camera*
            // parallaxes each layer by its actual depth — no per-layer tweens, and
            // the layers keep the CSS transforms GSAP would otherwise overwrite.
            //
            // Two transform-free wrappers split the work so nothing collides:
            //   camera → scroll dolly (z / y / rotationX) + idle sway (rotationZ)
            //   world  → pointer parallax (x / y / rotationX / rotationY)
            if (camera && world) {
              gsap.set([camera, world], { transformOrigin: "50% 42%" });

              gsap
                .timeline({
                  defaults: { ease: "none" },
                  scrollTrigger: {
                    trigger: heroSection,
                    start: "top top",
                    end: "bottom top",
                    scrub: 1,
                    invalidateOnRefresh: true,
                  },
                })
                // Dolly in rather than scale up. A layer at depth d scales by
                // p / (p - (zCamera + d)), so the near desk grows much faster
                // than the far wall — the parallax falls out of the projection.
                .fromTo(camera, { z: 0, y: 0, rotationX: 0 }, { z: 300, y: -70, rotationX: 6 }, 0)
                // Tightening the perspective at the same time stretches that
                // ratio further: a dolly zoom, not just a push-in.
                .fromTo(desk, { "--desk-perspective": "1600px" }, { "--desk-perspective": "1080px" }, 0)
                // Let the scene read through as it comes forward.
                .fromTo(wash, { opacity: 1 }, { opacity: 0.86 }, 0);

              // Idle sway, so the stage still breathes when the pointer is still.
              // rotationZ is untouched by both the dolly and the pointer.
              gsap.to(camera, {
                rotationZ: 0.45,
                duration: 9,
                ease: "sine.inOut",
                yoyo: true,
                repeat: -1,
              });

              // Pointer parallax. quickTo reuses one tween per property instead of
              // spawning a new tween per pointermove.
              const orient = {
                rotationY: gsap.quickTo(world, "rotationY", { duration: 0.9, ease: "power3.out" }),
                rotationX: gsap.quickTo(world, "rotationX", { duration: 0.9, ease: "power3.out" }),
                x: gsap.quickTo(world, "x", { duration: 0.9, ease: "power3.out" }),
                y: gsap.quickTo(world, "y", { duration: 0.9, ease: "power3.out" }),
              };
              let heroBox = pageBox(heroSection);
              const measureHero = () => {
                heroBox = pageBox(heroSection);
              };
              const aimDesk = (nx: number, ny: number) => {
                // At the hero's edge this is ~7deg of yaw. Across the scene's
                // 280px depth range that separates the far wall from the near
                // desk by roughly 34px — enough to read as depth, not as wobble.
                orient.rotationY(nx * 14);
                orient.rotationX(-ny * 9);
                orient.x(nx * -40);
                orient.y(ny * -20);
              };
              const onDeskPointer = (event: PointerEvent) => {
                if (!heroBox.width || !heroBox.height) return;
                const nx = (event.clientX + window.scrollX - heroBox.left) / heroBox.width - 0.5;
                const ny = (event.clientY + window.scrollY - heroBox.top) / heroBox.height - 0.5;
                // Past the hero, settle back to the resting angle.
                if (Math.abs(nx) > 0.6 || Math.abs(ny) > 0.75) return aimDesk(0, 0);
                aimDesk(nx, ny);
              };
              const restDesk = () => aimDesk(0, 0);

              const safeDeskPointer = contextSafe?.(onDeskPointer) ?? onDeskPointer;
              const safeRestDesk = contextSafe?.(restDesk) ?? restDesk;

              root.addEventListener("pointermove", safeDeskPointer as EventListener, { passive: true });
              root.addEventListener("pointerleave", safeRestDesk as EventListener, { passive: true });
              ScrollTrigger.addEventListener("refresh", measureHero);
              cleanups.push(() => {
                root.removeEventListener("pointermove", safeDeskPointer as EventListener);
                root.removeEventListener("pointerleave", safeRestDesk as EventListener);
                ScrollTrigger.removeEventListener("refresh", measureHero);
              });
            }

            // Ambient signal story: scan → signal → risk → route.
            const ambient = gsap.timeline({ repeat: -1, repeatDelay: 0.8, paused: true });
            // Base opacity comes from CSS (the desk is a dimmed background), so
            // capture it rather than assuming 1.
            const baseOpacity = new Map(
              monitors.map((monitor) => [monitor, Number(gsap.getProperty(monitor, "opacity"))]),
            );
            const focus = (monitor: HTMLElement | null, at: number) => {
              if (!monitor) return;
              const others = monitors.filter((item) => item !== monitor);
              ambient
                .to(others, { opacity: (i, t) => (baseOpacity.get(t as HTMLElement) ?? 1) * 0.34, duration: 0.5, ease: "power2.out" }, at)
                .to(monitor, { opacity: 1, scale: 1.05, duration: 0.5, ease: "power2.out" }, at);
            };
            const unfocus = (monitor: HTMLElement | null, at: number) => {
              if (!monitor) return;
              ambient.to(monitor, { scale: 1, duration: 0.45, ease: "power2.inOut" }, at);
            };
            const showCallout = (callout: HTMLElement | null, at: number) => {
              if (!callout) return;
              ambient
                .fromTo(callout, { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.4, ease: "power2.out" }, at)
                .to(callout, { autoAlpha: 0, y: -8, duration: 0.35, ease: "power2.in" }, at + 1.7);
            };

            // The scan beam is 2px wide — move it in px across the desk, and keep
            // the CSS translateZ/rotateZ inside the GSAP transform so it isn't wiped.
            if (scan) {
              gsap.set(scan, { z: 90, rotationZ: 7 });
              ambient.fromTo(
                scan,
                { x: () => -desk.clientWidth * 0.2, autoAlpha: 0 },
                { x: () => desk.clientWidth * 1.05, autoAlpha: 0.7, duration: 2.6, ease: "power1.inOut" },
                0,
              );
              ambient.to(scan, { autoAlpha: 0, duration: 0.5 }, 2.6);
            }

            // Pulse waypoints are measured live so they survive resize (invalidate).
            if (pulse) {
              gsap.set(pulse, { z: 100, autoAlpha: 0 });
              const to = (target: HTMLElement | null) =>
                target ? layoutOffsetBetween(pulse, target) : { x: 0, y: 0 };
              ambient
                .fromTo(pulse, { x: 0, y: 0, scale: 0.5, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 0.4, ease: "power2.out" }, 0.7)
                .to(pulse, { x: () => to(signalMonitor).x, y: () => to(signalMonitor).y, duration: 1, ease: "power2.inOut" }, 0.9)
                .to(pulse, { x: () => to(executionMonitor).x, y: () => to(executionMonitor).y, duration: 1.1, ease: "power2.inOut" }, 2.4)
                .to(pulse, { x: () => to(brokerRail).x, y: () => to(brokerRail).y, duration: 1.1, ease: "power2.inOut" }, 4.1)
                .to(pulse, { scale: 2.2, autoAlpha: 0, duration: 0.6, ease: "power2.in" }, 5.2);
            }

            focus(signalMonitor, 1.4);
            showCallout(callouts.signal, 1.5);
            unfocus(signalMonitor, 3.2);
            focus(executionMonitor, 3.3);
            showCallout(callouts.risk, 3.4);
            unfocus(executionMonitor, 5);

            if (routePath) {
              const length = routePath.getTotalLength();
              if (length) {
                gsap.set(routePath, { strokeDasharray: length, strokeDashoffset: length });
                ambient.fromTo(
                  routePath,
                  { strokeDashoffset: length },
                  { strokeDashoffset: 0, duration: 1.3, ease: "power2.inOut" },
                  4.2,
                );
                ambient.to(routePath, { strokeDashoffset: -length, duration: 1, ease: "power2.in" }, 6.2);
              }
            }
            showCallout(callouts.route, 5.1);

            // Restore the resting state before the loop repeats.
            ambient.to(
              monitors,
              { opacity: (i, t) => baseOpacity.get(t as HTMLElement) ?? 1, scale: 1, duration: 0.6, ease: "power2.inOut" },
              6.4,
            );

            // Only run while the desk is on screen, and re-measure on refresh.
            // onToggle alone is not enough: ScrollTrigger does not fire it for the
            // state it already has when it is created, so sync on refresh too.
            const syncAmbient = (active: boolean) => (active ? ambient.play() : ambient.pause());
            ScrollTrigger.create({
              trigger: heroSection,
              start: "top bottom",
              end: "bottom top",
              onToggle: (self) => syncAmbient(self.isActive),
              onRefresh: (self) => {
                ambient.invalidate();
                syncAmbient(self.isActive);
              },
            });
          }

          // ── Section reveals ───────────────────────────────────────────────
          const reveals = q<HTMLElement>("[data-reveal]");
          if (reveals.length) {
            gsap.set(reveals, { autoAlpha: 0, y: 42 });
            ScrollTrigger.batch(reveals, {
              start: "top 86%",
              once: true,
              onEnter: (batch) =>
                gsap.to(batch, {
                  autoAlpha: 1,
                  y: 0,
                  duration: 0.9,
                  ease: "power3.out",
                  stagger: 0.12,
                  overwrite: true,
                }),
            });
          }

          q<HTMLElement>("[data-reveal-line]").forEach((line) => {
            gsap.from(line, {
              scaleX: 0,
              transformOrigin: "left center",
              duration: 1.1,
              ease: "power3.inOut",
              scrollTrigger: { trigger: line, start: "top 88%", once: true },
            });
          });

          // ── Staggered groups ──────────────────────────────────────────────
          // One trigger per group with a real stagger, instead of one trigger
          // per item all firing at the same instant.
          q<HTMLElement>("[data-stagger]").forEach((group) => {
            const items = q<HTMLElement>("[data-stagger-item]", group);
            if (!items.length) return;
            gsap.from(items, {
              autoAlpha: 0,
              y: 28,
              duration: 0.8,
              ease: "power3.out",
              stagger: 0.09,
              scrollTrigger: { trigger: group, start: "top 84%", once: true },
            });
          });

          // ── Parallax / drift ──────────────────────────────────────────────
          q<HTMLElement>("[data-parallax]").forEach((element) => {
            gsap.to(element, {
              yPercent: Number(element.dataset.parallax ?? 16),
              ease: "none",
              scrollTrigger: {
                trigger: element,
                start: "clamp(top bottom)",
                end: "clamp(bottom top)",
                scrub: 1.2,
              },
            });
          });

          q<HTMLElement>("[data-drift]").forEach((element, index) => {
            gsap.to(element, {
              y: index % 2 === 0 ? -14 : 14,
              x: index % 2 === 0 ? 8 : -8,
              rotation: index % 2 === 0 ? 2 : -2,
              duration: 4.5 + index * 0.45,
              ease: "sine.inOut",
              yoyo: true,
              repeat: -1,
            });
          });

          // ── Ticker ────────────────────────────────────────────────────────
          // The track renders its content twice, so -50% is one seamless lap.
          const ticker = root.querySelector<HTMLElement>("[data-ticker]");
          if (ticker) {
            const marquee = gsap.to(ticker, { xPercent: -50, duration: 30, ease: "none", repeat: -1 });
            ScrollTrigger.create({
              trigger: ticker,
              start: "top bottom",
              end: "bottom top",
              onToggle: (self) => (self.isActive ? marquee.play() : marquee.pause()),
            });
          }

          // ── Route diagram line ────────────────────────────────────────────
          const routeDiagramPath = root.querySelector<SVGPathElement>("[data-route-path]");
          if (routeDiagramPath) {
            const length = routeDiagramPath.getTotalLength();
            if (length) {
              gsap.set(routeDiagramPath, { strokeDasharray: length, strokeDashoffset: length });
              gsap.to(routeDiagramPath, {
                strokeDashoffset: 0,
                duration: 1.8,
                ease: "power2.inOut",
                scrollTrigger: { trigger: routeDiagramPath, start: "top 90%", once: true },
              });
            }
          }

          // ── Pointer tilt ──────────────────────────────────────────────────
          const tiltNodes = q<HTMLElement>("[data-tilt]");
          if (tiltNodes.length && isDesktop) {
            // Cache the boxes: reading them on every pointermove thrashes layout,
            // and page-relative boxes stay valid while scrolling.
            let boxes = tiltNodes.map(pageBox);
            const measure = () => {
              boxes = tiltNodes.map(pageBox);
            };
            const tiltX = tiltNodes.map((node) =>
              gsap.quickTo(node, "rotationX", { duration: 0.55, ease: "power3.out" }),
            );
            const tiltY = tiltNodes.map((node) =>
              gsap.quickTo(node, "rotationY", { duration: 0.55, ease: "power3.out" }),
            );

            const onPointerMove = (event: PointerEvent) => {
              tiltNodes.forEach((_node, index) => {
                const box = boxes[index];
                if (!box.width || !box.height) return;
                const x = (event.clientX + window.scrollX - box.left) / box.width - 0.5;
                const y = (event.clientY + window.scrollY - box.top) / box.height - 0.5;
                // Outside the card (plus a small margin): settle back to flat.
                if (Math.abs(x) > 0.8 || Math.abs(y) > 0.8) {
                  tiltX[index](0);
                  tiltY[index](0);
                  return;
                }
                tiltX[index](-y * 3);
                tiltY[index](x * 3);
              });
            };
            const resetTilt = () => {
              tiltX.forEach((set) => set(0));
              tiltY.forEach((set) => set(0));
            };

            const safeMove = contextSafe?.(onPointerMove) ?? onPointerMove;
            const safeReset = contextSafe?.(resetTilt) ?? resetTilt;

            root.addEventListener("pointermove", safeMove as EventListener, { passive: true });
            root.addEventListener("pointerleave", safeReset as EventListener, { passive: true });
            // ScrollTrigger already refreshes on resize and on layout changes.
            ScrollTrigger.addEventListener("refresh", measure);

            cleanups.push(() => {
              root.removeEventListener("pointermove", safeMove as EventListener);
              root.removeEventListener("pointerleave", safeReset as EventListener);
              ScrollTrigger.removeEventListener("refresh", measure);
            });
          }
        },
      );

      // Web fonts change the layout after hydration, which moves every trigger.
      let cancelled = false;
      document.fonts?.ready.then(() => {
        if (!cancelled) ScrollTrigger.refresh();
      });

      return () => {
        cancelled = true;
        cleanups.forEach((cleanup) => cleanup());
        mm.revert();
      };
    },
    { scope },
  );
}
