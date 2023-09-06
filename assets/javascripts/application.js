// Turbo
import * as Turbo from "@hotwired/turbo"

// Stimulus
import { Application } from "@hotwired/stimulus"

window.Stimulus = Application.start()

import HelloController from "./controllers/hello_controller"
Stimulus.register("hello", HelloController)
