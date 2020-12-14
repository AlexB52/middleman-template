import hljs from 'highlight.js/lib/core';
import ruby from 'highlight.js/lib/languages/ruby';
import erb from 'highlight.js/lib/languages/erb';
import bash from 'highlight.js/lib/languages/bash';

import { Controller } from "stimulus"

export default class extends Controller {
  static targets = ["ruby", "erb", "bash"]

  initialize() {
    hljs.registerLanguage('ruby', ruby);
    hljs.registerLanguage('erb', erb);
    hljs.registerLanguage('bash', bash);
  }

  connect() {
    this.initializeRuby()
    this.initializeERB()
    this.initializeBash()
  }

  initializeRuby() {
    this.rubyTargets.forEach(block => hljs.highlightBlock(block, ruby))
  }

  initializeERB() {
    this.erbTargets.forEach(block => hljs.highlightBlock(block, erb))
  }

  initializeBash() {
    this.bashTargets.forEach(block => hljs.highlightBlock(block, bash))
  }
}