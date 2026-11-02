/*
 * MARAMOUR — Utilidades de la página de producto.
 *
 * <mm-variant-sync data-mm-sync="clave">: cuando la clienta cambia de color o talle, Horizon pide
 * al servidor la sección con la nueva variante. Este elemento reemplaza su contenido por el de la
 * respuesta (mismo data-mm-sync), así cuotas, transferencia, stock y aviso de stock se actualizan
 * sin lógica duplicada en JavaScript.
 *
 * [data-mm-open="id"]: abre el <details id="id"> del acordeón y lo lleva a la vista.
 */
import { StandardEvents } from '@shopify/events';

class MmVariantSync extends HTMLElement {
  connectedCallback() {
    this.section = this.closest('.shopify-section, dialog');
    this.section?.addEventListener(StandardEvents.productSelect, this.onSelect);
  }

  disconnectedCallback() {
    this.section?.removeEventListener(StandardEvents.productSelect, this.onSelect);
  }

  onSelect = (event) => {
    if (!(event.target instanceof Element) || event.target.closest('product-card')) return;
    event.promise
      ?.then(({ detail }) => {
        const html = detail?.html;
        if (!html) return;
        const fresh = html.querySelector(`mm-variant-sync[data-mm-sync="${this.dataset.mmSync}"]`);
        if (fresh) this.innerHTML = fresh.innerHTML;
      })
      .catch(() => {});
  };
}

/* Barra de progreso de la galería (celular): sigue el desplazamiento del carrusel de fotos */
document.addEventListener(
  'scroll',
  (event) => {
    const scroller = event.target;
    if (!(scroller instanceof Element) || scroller.tagName !== 'SLIDESHOW-SLIDES') return;
    const bar = scroller.closest('media-gallery')?.querySelector('.mm-gallery-bar > span');
    if (!bar) return;
    const n = scroller.children.length || 1;
    const max = scroller.scrollWidth - scroller.clientWidth;
    const progress = max > 0 ? Math.min(1, Math.max(0, scroller.scrollLeft / max)) : 0;
    bar.style.transform = `translateX(${progress * (n - 1) * 100}%)`;
  },
  { capture: true, passive: true }
);

if (!customElements.get('mm-variant-sync')) customElements.define('mm-variant-sync', MmVariantSync);

document.addEventListener('click', (event) => {
  const opener = event.target instanceof Element ? event.target.closest('[data-mm-open]') : null;
  if (!opener) return;
  const target = document.getElementById(opener.getAttribute('data-mm-open'));
  if (!(target instanceof HTMLDetailsElement)) return;
  event.preventDefault();
  target.open = true;
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
});

/*
 * Talle agotado: tocarlo no lo elige (no se puede comprar); abre el popup «Avisame cuando vuelva»
 * con el color elegido y ese talle. El pedido se envía con el formulario de contacto nativo.
 */
document.addEventListener(
  'click',
  (event) => {
    const label = event.target instanceof Element ? event.target.closest('.mm-opt--text .variant-option__button-label') : null;
    const input = label?.querySelector('input[type="radio"]');
    if (!input || input.dataset.optionAvailable !== 'false') return;
    const dialog = document.getElementById('mm-notify');
    if (!(dialog instanceof HTMLDialogElement)) return;
    event.preventDefault();
    event.stopPropagation();

    const picker = label.closest('variant-picker');
    const color = picker?.querySelector('.mm-opt--color input:checked')?.value;
    const variantTitle = [color, input.value].filter(Boolean).join(' / ');
    const productTitle = picker?.dataset.productTitle || document.title;

    dialog.querySelector('[data-mm-notify-variant]').textContent = `Talle ${input.value}${color ? ` en ${color}` : ''}`;
    dialog.querySelector('[data-mm-notify-field="variant"]').value = variantTitle;
    dialog.querySelector('[data-mm-notify-field="body"]').value = `Avisar cuando vuelva a entrar en stock: ${productTitle} — ${variantTitle}`;
    dialog.querySelector('[data-mm-notify-body]').hidden = false;
    dialog.querySelector('[data-mm-notify-done]').hidden = true;
    dialog.querySelector('[data-mm-notify-error]').hidden = true;
    dialog.showModal();
    document.documentElement.classList.add('mm-sheet-lock');
    dialog.addEventListener('close', () => document.documentElement.classList.remove('mm-sheet-lock'), { once: true });
  },
  { capture: true }
);

/*
 * Envío del aviso sin recargar la página.
 * Shopify protege el formulario de contacto con hCaptcha: su script frena el envío, consigue el
 * token y después llama a form.submit(). Reemplazamos ese submit() del formulario por un envío con
 * fetch (con el token incluido), así la página no se recarga y mostramos la confirmación en rosa.
 * Si Shopify pide una verificación visible o algo falla, se envía de la forma normal (con recarga),
 * y al volver se muestra la misma confirmación.
 */
const nativeSubmit = HTMLFormElement.prototype.submit;

const notifySuccess = (form) => {
  const dialog = form.closest('#mm-notify');
  if (dialog) {
    dialog.querySelector('[data-mm-notify-body]').hidden = true;
    dialog.querySelector('[data-mm-notify-done]').hidden = false;
    return;
  }
  const done = document.createElement('p');
  done.className = 'mm-stock__done';
  done.setAttribute('role', 'status');
  done.textContent = '¡Listo! Te avisamos por mail apenas vuelva a entrar en stock.';
  form.replaceChildren(done);
};

const fullSubmit = (form) => {
  try {
    sessionStorage.setItem('mm-notify', '1');
  } catch {}
  nativeSubmit.call(form);
};

const sendNotify = async (form) => {
  if (form.dataset.mmSending) return;
  form.dataset.mmSending = '1';
  const button = form.querySelector('button[type="submit"]');
  button?.setAttribute('disabled', '');
  form.querySelector('[data-mm-notify-error], .mm-stock__error')?.setAttribute('hidden', '');

  const data = new FormData(form);
  data.set('return_to', '/cart.js?mm_notify=ok');

  try {
    const response = await fetch(form.action, { method: 'POST', body: data, credentials: 'same-origin' });
    const url = response.url || '';
    if (response.ok && (url.includes('/cart.js') || url.includes('contact_posted=true'))) {
      notifySuccess(form);
      return;
    }
    if (url.includes('challenge') || response.status === 400 || response.status === 403 || response.status === 429) {
      fullSubmit(form);
      return;
    }
    // Shopify devolvió el formulario con errores (por ejemplo, email inválido)
    const error = form.querySelector('[data-mm-notify-error], .mm-stock__error');
    if (error) error.hidden = false;
  } catch {
    fullSubmit(form);
  } finally {
    delete form.dataset.mmSending;
    button?.removeAttribute('disabled');
  }
};

const bindNotify = (form) => {
  if (!(form instanceof HTMLFormElement) || !form.matches('[data-mm-notify-form]') || form.mmBound) return;
  form.mmBound = true;
  form.submit = () => sendNotify(form);
};

for (const type of ['focusin', 'pointerdown']) {
  document.addEventListener(type, (event) => bindNotify(event.target instanceof Element ? event.target.closest('form') : null), true);
}

window.addEventListener(
  'submit',
  (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.matches('[data-mm-notify-form]')) return;
    if (!form.checkValidity()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      form.reportValidity();
      return;
    }
    bindNotify(form);
  },
  true
);

window.addEventListener('submit', (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || !form.matches('[data-mm-notify-form]')) return;
  // Si el script de Shopify ya frenó el envío (está consiguiendo el token), él llamará a form.submit()
  if (event.defaultPrevented) return;
  event.preventDefault();
  sendNotify(form);
});

const showNotifyDone = () => {
  const params = new URLSearchParams(location.search);
  let pending = false;
  try {
    pending = sessionStorage.getItem('mm-notify') === '1';
    sessionStorage.removeItem('mm-notify');
  } catch {}
  if (!pending || !(params.get('mm_notify') === 'ok' || params.get('contact_posted') === 'true')) return;
  const dialog = document.getElementById('mm-notify');
  if (!(dialog instanceof HTMLDialogElement)) return;
  dialog.querySelector('[data-mm-notify-body]').hidden = true;
  dialog.querySelector('[data-mm-notify-done]').hidden = false;
  dialog.showModal();
  params.delete('mm_notify');
  params.delete('contact_posted');
  const query = params.toString();
  history.replaceState(null, '', location.pathname + (query ? `?${query}` : ''));
};

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', showNotifyDone);
else showNotifyDone();
