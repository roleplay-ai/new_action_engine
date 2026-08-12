/** Shared “how to install on iPhone” copy for the login button sheet and
 * the home-screen popup. iOS has no beforeinstallprompt API. */
export default function IosInstallSteps({ className }: { className?: string }) {
  return (
    <ol className={className ?? "ios-install-steps"}>
      <li>
        Tap the <strong>Share</strong> button
        <span className="ios-install-share-glyph" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v12" />
            <path d="m8 7 4-4 4 4" />
            <path d="M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
          </svg>
        </span>
        in Safari
      </li>
      <li>
        Scroll and tap <strong>Add to Home Screen</strong>
      </li>
      <li>
        Tap <strong>Add</strong>
      </li>
    </ol>
  );
}
