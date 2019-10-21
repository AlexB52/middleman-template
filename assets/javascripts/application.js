var Turbolinks = require("turbolinks")
Turbolinks.start()

import { Application } from "stimulus"
import { definitionsFromContext } from "stimulus/webpack-helpers"
import './methods.js'
const application = Application.start()
const context = require.context("./controllers", true, /\.js$/)
application.load(definitionsFromContext(context))