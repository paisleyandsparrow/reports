// Runs at document_start — saves the native fetch before Amazon's SPA can override it.
// Equivalent to Playwright's add_init_script("window.__fetch = window.fetch")
window.__fetch = window.fetch.bind(window)
