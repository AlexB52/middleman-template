import { Controller } from "stimulus"

export default class extends Controller {
  static targets = ["image"]

  connect() {
    this.displayImage()
  }

  displayImage() {
    this.imageTarget.style.display = this.display
  }

  toggleImage(event) {
    event.preventDefault()

    this.display = (this.display === 'none') ? 'block' : 'none'
  }

  get display() {
    return this.data.get('display')
  }

  set display(value) {
    this.data.set('display', value)
    this.displayImage()
  }
}