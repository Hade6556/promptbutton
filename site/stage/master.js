// Staging only: the draft and the finished prompt shown in the photographed states.
window.STAGE_DRAFT = 'i want to build a landing page';
window.STAGE_MASTER = [
  'Role: You are a senior product designer who also ships production front-end code, and you build marketing pages for developer tools (assumed). You judge a page by whether a stranger understands it in five seconds and clicks Download.',
  'Goal: Build a landing page for a Mac prompt-enhancer app whose one job is getting developers who use AI coding tools to download it.',
  'Context: The product is a menu-bar app. The user presses ⌥⇧P on a rough draft in any app and gets a complete prompt back, with clarifying questions only when something is missing. Brand: our amber on white, system type. Hosting: static files, no backend.',
  'Task:\n1. Hero with one headline, one subline and one "Download for Mac" button.\n2. How it works in three steps: press the key, it reads the screen, you get the prompt.\n3. A before/after example, a features section, an FAQ on privacy, permissions and cost, and a footer that repeats the button.',
  'Quality bar: A visitor knows what it is and who it is for within five seconds. One primary button above the fold, everything else quieter. Works at 375, 768 and 1280 px with no horizontal scroll. Visible focus states, contrast of at least 4.5:1, alt text on every image.',
  'Constraints: One static HTML file in our amber brand, no frameworks. Placeholder copy in our voice, marked [REPLACE]. Never lorem ipsum.',
  'Output: index.html with embedded CSS and JS (assumed), plus the command to serve it locally.',
  'Done when: It opens on localhost and the Download button is the obvious first action.',
  'Assumptions: [download URL], [app price or free].',
].join('\n\n');
