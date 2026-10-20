/* Local development: copy this file to js/config.js and fill it in.
   For GitHub Pages, do NOT put a real key in git — add repository secret
   GEMINI_API_KEY and let .github/workflows/deploy.yml inject it at deploy.

   geminiApiKey  Google AI Studio key (https://aistudio.google.com/apikey).
                 Leave "" or the placeholder to turn Gemini off: options
                 questions are still marked; a parent marks written answers.
   pinHash       Parent PIN hash. In the browser console run  pinHash('1234')
                 and paste the result. Default 'c4f72bb0' matches P4 Maths. */
window.APP_CONFIG = {
  geminiApiKey: "",
  pinHash: "c4f72bb0"
};
