export function AuthIllustration() {
  return (
    <div className="auth-illustration-container" aria-hidden="true">
      <svg
        className="auth-illustration-svg"
        viewBox="0 0 520 620"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Wall and Room Gradients */}
          <linearGradient id="wallGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#d2eeac" />
            <stop offset="60%" stopColor="#bee393" />
            <stop offset="100%" stopColor="#a9d67d" />
          </linearGradient>

          <linearGradient id="floorGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#2c5a3d" />
            <stop offset="100%" stopColor="#1e412b" />
          </linearGradient>

          {/* Desk Surface & Edge */}
          <linearGradient id="deskTop" x1="0%" y1="0%" x2="100%" y2="50%">
            <stop offset="0%" stopColor="#2e6344" />
            <stop offset="100%" stopColor="#224b33" />
          </linearGradient>

          <linearGradient id="deskEdge" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#1a3b27" />
            <stop offset="100%" stopColor="#132c1e" />
          </linearGradient>

          {/* Laptop Gradients */}
          <linearGradient id="laptopBase" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#555d58" />
            <stop offset="100%" stopColor="#383d3a" />
          </linearGradient>

          <linearGradient id="laptopScreen" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f3fae8" />
            <stop offset="100%" stopColor="#def2be" />
          </linearGradient>

          {/* Plant & Pot Gradients */}
          <linearGradient id="plantLeaf1" x1="0%" y1="100%" x2="50%" y2="0%">
            <stop offset="0%" stopColor="#2e6b37" />
            <stop offset="70%" stopColor="#4f9e43" />
            <stop offset="100%" stopColor="#aee841" />
          </linearGradient>

          <linearGradient id="plantLeaf2" x1="0%" y1="100%" x2="80%" y2="0%">
            <stop offset="0%" stopColor="#23572c" />
            <stop offset="60%" stopColor="#3d8236" />
            <stop offset="100%" stopColor="#89cb34" />
          </linearGradient>

          <linearGradient id="ceramicPot" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="60%" stopColor="#edf2e6" />
            <stop offset="100%" stopColor="#d3dec5" />
          </linearGradient>

          {/* Mug & Accent */}
          <linearGradient id="mugGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#5d65a8" />
            <stop offset="100%" stopColor="#424982" />
          </linearGradient>

          <linearGradient id="limeOrb" x1="20%" y1="20%" x2="90%" y2="90%">
            <stop offset="0%" stopColor="#e8ff78" />
            <stop offset="60%" stopColor="#c3eb39" />
            <stop offset="100%" stopColor="#8db51f" />
          </linearGradient>

          {/* Soft Shadows */}
          <radialGradient id="deskShadow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(10, 25, 15, 0.45)" />
            <stop offset="100%" stopColor="rgba(10, 25, 15, 0)" />
          </radialGradient>

          <radialGradient id="potShadow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(10, 25, 15, 0.5)" />
            <stop offset="100%" stopColor="rgba(10, 25, 15, 0)" />
          </radialGradient>

          <filter id="softGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="8" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>

          <filter id="clayShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="8" stdDeviation="6" floodColor="rgba(25, 45, 20, 0.25)" />
          </filter>
        </defs>

        {/* Room Backdrop */}
        <rect width="520" height="620" fill="url(#wallGradient)" />

        {/* Isometric Floor Plane */}
        <path
          d="M0 380 L520 380 L520 620 L0 620 Z"
          fill="url(#floorGradient)"
        />
        {/* Subtle floor baseboard trim */}
        <line x1="0" y1="380" x2="520" y2="380" stroke="#1d3d29" strokeWidth="3" />

        {/* 3D Wall Clock */}
        <g transform="translate(360, 90)" filter="url(#clayShadow)">
          {/* Outer ring */}
          <circle cx="45" cy="45" r="42" fill="#243328" />
          <circle cx="45" cy="45" r="39" fill="url(#ceramicPot)" />
          {/* Hour markers */}
          <circle cx="45" cy="14" r="2.5" fill="#243328" />
          <circle cx="76" cy="45" r="2.5" fill="#243328" />
          <circle cx="45" cy="76" r="2.5" fill="#243328" />
          <circle cx="14" cy="45" r="2.5" fill="#243328" />
          {/* Hands */}
          <line
            x1="45"
            y1="45"
            x2="45"
            y2="24"
            stroke="#1b281e"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
          <line
            x1="45"
            y1="45"
            x2="63"
            y2="45"
            stroke="#8db51f"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <circle cx="45" cy="45" r="4" fill="#c3eb39" />
        </g>

        {/* Floating 3D Spheres / Aesthetic Accent Orbs */}
        <circle cx="75" cy="120" r="18" fill="url(#limeOrb)" filter="url(#softGlow)" />
        <circle cx="105" cy="85" r="9" fill="#f0fadc" opacity="0.8" />
        <circle cx="470" cy="240" r="14" fill="url(#limeOrb)" opacity="0.85" filter="url(#softGlow)" />

        {/* Ground Shadows */}
        <ellipse cx="230" cy="510" rx="190" ry="32" fill="url(#deskShadow)" />
        <ellipse cx="430" cy="535" rx="45" ry="16" fill="url(#potShadow)" />

        {/* --- Modern Work Desk --- */}
        <g id="workDesk" filter="url(#clayShadow)">
          {/* Back Left Leg */}
          <rect x="75" y="360" width="12" height="135" rx="6" fill="#e9eee2" />
          <rect x="75" y="485" width="12" height="12" rx="3" fill="#303b25" />

          {/* Back Right Leg */}
          <rect x="345" y="360" width="12" height="135" rx="6" fill="#e9eee2" />
          <rect x="345" y="485" width="12" height="12" rx="3" fill="#303b25" />

          {/* Front Left Leg */}
          <rect x="60" y="375" width="14" height="135" rx="7" fill="#ffffff" />
          <rect x="60" y="500" width="14" height="12" rx="3" fill="#202919" />

          {/* Front Right Leg */}
          <rect x="360" y="375" width="14" height="135" rx="7" fill="#ffffff" />
          <rect x="360" y="500" width="14" height="12" rx="3" fill="#202919" />

          {/* Desk Top Bevel Edge */}
          <path
            d="M 45 355 L 385 355 C 395 355 400 360 400 368 L 398 376 C 398 382 392 386 382 386 L 48 386 C 38 386 32 382 32 376 L 30 368 C 30 360 35 355 45 355 Z"
            fill="url(#deskEdge)"
          />

          {/* Desk Top Surface */}
          <path
            d="M 45 350 L 385 350 C 395 350 400 355 400 363 L 395 372 C 395 378 388 382 378 382 L 52 382 C 42 382 35 378 35 372 L 30 363 C 30 355 35 350 45 350 Z"
            fill="url(#deskTop)"
          />
        </g>

        {/* --- Open Modern Laptop --- */}
        <g id="laptop" transform="translate(145, 255)" filter="url(#clayShadow)">
          {/* Base */}
          <path
            d="M 10 92 L 130 92 C 135 92 138 95 138 98 L 135 105 C 135 108 130 110 125 110 L 15 110 C 10 110 5 108 5 105 L 2 98 C 2 95 5 92 10 92 Z"
            fill="url(#laptopBase)"
          />
          {/* Keyboard recessed tray */}
          <rect x="22" y="94" width="96" height="12" rx="2" fill="#2a2e2c" />
          {/* Trackpad */}
          <rect x="54" y="107" width="32" height="2" rx="1" fill="#464c48" />

          {/* Screen Display Housing */}
          <path
            d="M 12 10 C 12 4 16 0 22 0 L 118 0 C 124 0 128 4 128 10 L 128 92 L 12 92 Z"
            fill="#232725"
          />
          {/* Screen Glass */}
          <rect x="18" y="6" width="104" height="80" rx="3" fill="url(#laptopScreen)" />

          {/* Abstract Screen Content (StudyMomentum Dashboard Miniature) */}
          <rect x="26" y="14" width="32" height="6" rx="3" fill="#2d5236" />
          <rect x="26" y="26" width="24" height="4" rx="2" fill="#88b532" />

          {/* Mini Bar Chart */}
          <rect x="26" y="55" width="8" height="22" rx="2" fill="#c3eb39" />
          <rect x="38" y="45" width="8" height="32" rx="2" fill="#2c5e39" />
          <rect x="50" y="50" width="8" height="27" rx="2" fill="#86bc2e" />
          <rect x="62" y="38" width="8" height="39" rx="2" fill="#254d2f" />

          {/* Mini Checklist Card */}
          <rect x="78" y="24" width="36" height="48" rx="4" fill="#ffffff" />
          <circle cx="86" cy="34" r="3" fill="#a4d82b" />
          <rect x="92" y="32" width="16" height="3" rx="1.5" fill="#3d4a32" />
          <circle cx="86" cy="46" r="3" fill="#a4d82b" />
          <rect x="92" y="44" width="18" height="3" rx="1.5" fill="#3d4a32" />
          <circle cx="86" cy="58" r="3" fill="#d5e3be" />
          <rect x="92" y="56" width="14" height="3" rx="1.5" fill="#8b997e" />
        </g>

        {/* --- Coffee Mug with Steam --- */}
        <g id="coffeeMug" transform="translate(305, 325)">
          {/* Mug handle */}
          <path
            d="M 28 14 C 36 14 36 28 28 28"
            stroke="#424982"
            strokeWidth="4"
            fill="none"
          />
          {/* Mug body */}
          <rect x="4" y="8" width="26" height="30" rx="6" fill="url(#mugGrad)" />
          {/* Rim */}
          <ellipse cx="17" cy="8" rx="13" ry="4" fill="#6d76bb" />
          <ellipse cx="17" cy="8" rx="10" ry="2.5" fill="#2c1f17" />
          {/* Gentle Steam Paths */}
          <path
            d="M 12 2 C 10 -4 14 -8 12 -14"
            stroke="#ffffff"
            strokeWidth="1.5"
            strokeLinecap="round"
            opacity="0.6"
          />
          <path
            d="M 20 0 C 18 -6 22 -10 20 -16"
            stroke="#ffffff"
            strokeWidth="1.5"
            strokeLinecap="round"
            opacity="0.4"
          />
        </g>

        {/* Small Timer / Smart Block on Desk */}
        <g id="timerCube" transform="translate(85, 342)" filter="url(#clayShadow)">
          <rect x="0" y="0" width="22" height="22" rx="5" fill="#1b241c" />
          <circle cx="11" cy="11" r="5" fill="#c3eb39" />
        </g>

        {/* --- Potted Snake Plant (Sansevieria) --- */}
        <g id="pottedPlant" transform="translate(390, 310)">
          {/* Tall stylized leaves */}
          <path
            d="M 40 180 C 42 110 20 40 45 0 C 65 40 48 110 50 180 Z"
            fill="url(#plantLeaf1)"
          />
          <path
            d="M 30 180 C 26 120 8 60 25 15 C 42 60 36 120 38 180 Z"
            fill="url(#plantLeaf2)"
          />
          <path
            d="M 52 180 C 58 130 75 70 60 30 C 45 70 54 130 56 180 Z"
            fill="url(#plantLeaf2)"
          />
          <path
            d="M 20 180 C 14 140 0 90 12 50 C 24 90 26 140 28 180 Z"
            fill="url(#plantLeaf1)"
          />

          {/* Plant Pot */}
          <polygon
            points="15,160 65,160 58,230 22,230"
            fill="url(#ceramicPot)"
            filter="url(#clayShadow)"
          />
          {/* Pot Rim */}
          <ellipse cx="40" cy="160" rx="25" ry="7" fill="#ffffff" />
          <ellipse cx="40" cy="160" rx="21" ry="5" fill="#2a4527" />
        </g>

        {/* --- Floating Focus Badge Overlay --- */}
        <g transform="translate(50, 485)" filter="url(#clayShadow)">
          <rect
            x="0"
            y="0"
            width="200"
            height="46"
            rx="23"
            fill="rgba(255, 255, 255, 0.92)"
          />
          <circle cx="24" cy="23" r="13" fill="#c3eb39" />
          {/* Play/Check mark in circle */}
          <path
            d="M 22 18 L 27 23 L 22 28"
            stroke="#1d281a"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <text
            x="46"
            y="22"
            fill="#1d281a"
            fontSize="12"
            fontWeight="bold"
            fontFamily="system-ui, -apple-system, sans-serif"
          >
            25:00 · Deep Focus
          </text>
          <text
            x="46"
            y="35"
            fill="#5a6b4a"
            fontSize="10"
            fontFamily="system-ui, -apple-system, sans-serif"
          >
            Building intentional habits
          </text>
        </g>
      </svg>
    </div>
  );
}
