/**
 * Browser context extraction utilities for dynamic analysis.
 * Queries the current page state via WebDriver to provide context for LLM-guided step refinement.
 */

/**
 * Extracts comprehensive browser context including DOM structure, forms, inputs, buttons, and links.
 *
 * @param {Object} driver - WebDriverIO driver instance
 * @returns {Promise<Object>} Browser context object with page state
 * @returns {string} .url - Current page URL
 * @returns {string} .title - Page title
 * @returns {Array<Object>} .forms - Form elements with inputs (includes attributes and aria)
 * @returns {Array<Object>} .inputs - All input elements (type, name, id, placeholder, value, attributes, aria)
 * @returns {Array<Object>} .buttons - Button elements (text, type, id, class, attributes, aria)
 * @returns {Array<Object>} .links - Link elements (text, href, attributes, aria)
 * @returns {Array<Object>} .headings - Heading elements (level, text, attributes, aria)
 * @returns {string} .visibleText - Visible text content on page (trimmed)
 * @returns {string} .fullDOM - Complete HTML DOM as string
 */
async function extractBrowserContext(driver) {
  try {
    // Execute script in browser to gather comprehensive page state
    const context = await driver.execute(
      `
      return (function() {
        // Helper to get all attributes from an element
        function getAllAttributes(element) {
          const attrs = {};
          if (!element || !element.attributes) return attrs;
          for (let i = 0; i < element.attributes.length; i++) {
            const attr = element.attributes[i];
            attrs[attr.name] = attr.value;
          }
          return attrs;
        }

        // Helper to get all ARIA attributes
        function getAriaAttributes(element) {
          const aria = {};
          if (!element || !element.attributes) return aria;
          for (let i = 0; i < element.attributes.length; i++) {
            const attr = element.attributes[i];
            if (attr.name.startsWith('aria-')) {
              aria[attr.name] = attr.value;
            }
          }
          return aria;
        }

        // Helper to get visible text content
        function getVisibleText(element) {
          if (!element || element.offsetParent === null) return '';
          return element.innerText || element.textContent || '';
        }

        // Helper to check if element is visible
        function isVisible(element) {
          if (!element) return false;
          const style = window.getComputedStyle(element);
          return style.display !== 'none' && 
                 style.visibility !== 'hidden' && 
                 style.opacity !== '0' &&
                 element.offsetParent !== null;
        }

        // Extract form information
        const forms = Array.from(document.querySelectorAll('form')).map((form, idx) => {
          const inputs = Array.from(form.querySelectorAll('input, textarea, select')).map(input => ({
            type: input.type || input.tagName.toLowerCase(),
            name: input.name || '',
            id: input.id || '',
            placeholder: input.placeholder || '',
            label: input.labels && input.labels[0] ? input.labels[0].innerText : '',
            visible: isVisible(input),
            attributes: getAllAttributes(input),
            aria: getAriaAttributes(input)
          }));
          
          return {
            index: idx,
            id: form.id || '',
            name: form.name || '',
            action: form.action || '',
            method: form.method || 'get',
            inputs: inputs,
            visible: isVisible(form),
            attributes: getAllAttributes(form),
            aria: getAriaAttributes(form)
          };
        });

        // Extract all input elements (including those outside forms)
        const inputs = Array.from(document.querySelectorAll('input, textarea, select')).map(input => ({
          type: input.type || input.tagName.toLowerCase(),
          name: input.name || '',
          id: input.id || '',
          placeholder: input.placeholder || '',
          value: input.type === 'password' ? '' : (input.value || ''),
          label: input.labels && input.labels[0] ? input.labels[0].innerText : '',
          ariaLabel: input.getAttribute('aria-label') || '',
          visible: isVisible(input),
          selector: input.id ? '#' + input.id : (input.name ? '[name="' + input.name + '"]' : ''),
          attributes: getAllAttributes(input),
          aria: getAriaAttributes(input)
        })).filter(input => input.visible);

        // Extract button elements
        const buttons = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"]')).map(btn => ({
          text: getVisibleText(btn) || btn.value || '',
          type: btn.type || 'button',
          id: btn.id || '',
          className: btn.className || '',
          name: btn.name || '',
          ariaLabel: btn.getAttribute('aria-label') || '',
          visible: isVisible(btn),
          selector: btn.id ? '#' + btn.id : (btn.className ? '.' + btn.className.split(' ')[0] : ''),
          attributes: getAllAttributes(btn),
          aria: getAriaAttributes(btn)
        })).filter(btn => btn.visible);

        // Extract link elements
        const links = Array.from(document.querySelectorAll('a[href]')).map(link => ({
          text: getVisibleText(link),
          href: link.href,
          id: link.id || '',
          className: link.className || '',
          visible: isVisible(link),
          selector: link.id ? '#' + link.id : '',
          attributes: getAllAttributes(link),
          aria: getAriaAttributes(link)
        })).filter(link => link.visible && link.text.trim().length > 0);

        // Extract visible headings for context
        const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6')).map(h => ({
          level: h.tagName.toLowerCase(),
          text: getVisibleText(h),
          attributes: getAllAttributes(h),
          aria: getAriaAttributes(h)
        })).filter(h => h.text.trim().length > 0);

        // Get main visible text content (limited to avoid overwhelming context)
        const visibleText = getVisibleText(document.body).trim().substring(0, 2000);

        // Get the full DOM as HTML string
        const fullDOM = document.documentElement.outerHTML;

        return {
          url: window.location.href,
          title: document.title,
          forms: forms,
          inputs: inputs.slice(0, 20), // Limit to first 20 inputs
          buttons: buttons.slice(0, 20), // Limit to first 20 buttons
          links: links.slice(0, 30), // Limit to first 30 links
          headings: headings.slice(0, 10), // Limit to first 10 headings
          visibleText: visibleText,
          fullDOM: fullDOM
        };
      })();
    `,
      []
    );

    return context;
  } catch (error) {
    // If context extraction fails, return minimal context
    return {
      url: await driver.getUrl().catch(() => "unknown"),
      title: await driver.getTitle().catch(() => "unknown"),
      forms: [],
      inputs: [],
      buttons: [],
      links: [],
      headings: [],
      visibleText: "",
      fullDOM: "",
      error: error.message,
    };
  }
}

/**
 * Formats browser context into a human-readable string for LLM prompts.
 *
 * @param {Object} context - Browser context from extractBrowserContext()
 * @returns {string} Formatted context string
 */
function formatContextForPrompt(context) {
  let formatted = `CURRENT PAGE STATE:\n`;
  formatted += `URL: ${context.url}\n`;
  formatted += `Title: ${context.title}\n\n`;

  if (context.headings && context.headings.length > 0) {
    formatted += `Headings:\n`;
    context.headings.forEach((h) => {
      formatted += `  ${h.level}: ${h.text}\n`;
    });
    formatted += `\n`;
  }

  if (context.forms && context.forms.length > 0) {
    formatted += `Forms (${context.forms.length}):\n`;
    context.forms.forEach((form, idx) => {
      const method = form.method ? form.method.toUpperCase() : "GET";
      formatted += `  Form ${idx}: ${
        form.id || form.name || "unnamed"
      } (${method} ${form.action || "no action"})\n`;
      if (form.inputs.length > 0) {
        formatted += `    Inputs: ${form.inputs
          .map(
            (i) =>
              `${i.type}${i.name ? '[name="' + i.name + '"]' : ""}${
                i.id ? '[id="' + i.id + '"]' : ""
              }`
          )
          .join(", ")}\n`;
      }
    });
    formatted += `\n`;
  }

  if (context.inputs && context.inputs.length > 0) {
    formatted += `Input Fields (${context.inputs.length}):\n`;
    context.inputs.slice(0, 10).forEach((input) => {
      const label =
        input.label || input.ariaLabel || input.placeholder || "unlabeled";
      formatted += `  - ${input.type}: "${label}" ${input.selector}\n`;
    });
    if (context.inputs.length > 10) {
      formatted += `  ... and ${context.inputs.length - 10} more\n`;
    }
    formatted += `\n`;
  }

  if (context.buttons && context.buttons.length > 0) {
    formatted += `Buttons (${context.buttons.length}):\n`;
    context.buttons.slice(0, 10).forEach((btn) => {
      formatted += `  - "${btn.text}" ${btn.selector}\n`;
    });
    if (context.buttons.length > 10) {
      formatted += `  ... and ${context.buttons.length - 10} more\n`;
    }
    formatted += `\n`;
  }

  if (context.links && context.links.length > 0) {
    formatted += `Links (${context.links.length}):\n`;
    context.links.slice(0, 10).forEach((link) => {
      formatted += `  - "${link.text}" -> ${link.href}\n`;
    });
    if (context.links.length > 10) {
      formatted += `  ... and ${context.links.length - 10} more\n`;
    }
    formatted += `\n`;
  }

  if (context.visibleText) {
    formatted += `Visible Text Preview:\n${context.visibleText.substring(
      0,
      500
    )}${context.visibleText.length > 500 ? "..." : ""}\n`;
  }

  if (context.error) {
    formatted += `\nNote: Context extraction encountered an error: ${context.error}\n`;
  }

  return formatted;
}

module.exports = {
  extractBrowserContext,
  formatContextForPrompt,
};
