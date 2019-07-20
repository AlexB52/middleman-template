import { Controller } from "stimulus"

export default class extends Controller {
  initialize() {
    this.trackingNumber = 'UA-31569872-7'
    window.dataLayer = window.dataLayer || [];

    this.gtag('js', new Date());
    this.gtag('config', this.trackingNumber);
  }

  gtag() {
    dataLayer.push(arguments)
  }

  sendPageView() {
    this.gtag('config', this.trackingNumber, {'page_path': window.location.pathname});
  }
}
