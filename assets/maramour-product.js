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
 * Envío del aviso: se hace con el envío normal del formulario (así funciona la verificación
 * anti-spam de Shopify). Al volver a la página (?mm_notify=ok) se muestra la confirmación.
 */
document.addEventListener('submit', (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || form.id !== 'mm-notify-form') return;
  if (!form.checkValidity()) {
    event.preventDefault();
    form.reportValidity();
    return;
  }
  try {
    sessionStorage.setItem('mm-notify', '1');
  } catch {}
  form.querySelector('button[type="submit"]')?.setAttribute('disabled', '');
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
