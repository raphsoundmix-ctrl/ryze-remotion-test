/**
 * Cross-section request to load a variant into the Playground Player. A plain `#v=<id>` hash link
 * would do nothing the second time it is clicked (no hashchange), so links dispatch this event instead;
 * the hash form is still read on load for shared URLs.
 */
export const OPEN_VARIANT_EVENT = "norda:open-variant";

export const openVariant = (id: string) => window.dispatchEvent(new CustomEvent(OPEN_VARIANT_EVENT, { detail: id }));

export const variantHref = (id: string) => `#v=${id}`;

export const variantFromHash = (hash: string) => new URLSearchParams(hash.replace(/^#/, "")).get("v");
