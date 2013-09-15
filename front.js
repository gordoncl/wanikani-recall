/**
 * Variables and helper functions.
 */
var App = {
  // Constants.
  STROKE_WIDTH: 3,

  WANIKANI_API: "http://www.wanikani.com/api/user/",

  // Variables.
  context: document.getElementById("canvas").getContext("2d"),

  drawing: false,

  deck: [],

  paper: Raphael("paper", 570, 109),

  previousWords: [],

  revealed: false,

  user: {},

  vocab: [],

  word: null,

  /**
   * Builds a deck based on the levels the user has chosen
   * and their completed vocabulary items.
   */
  buildDeck: function() {
    // Just clone vocab.
    var deck = [];

    // Filter words that haven't been started or are not
    // in the selected levels.
    var validLevels = jQuery("#levels-container .levels select").val();
    var vocab = jQuery.grep(this.vocab, function(word) {
      if (jQuery.inArray(word.level.toString(), validLevels) == -1 || 
        typeof word.stats == "undefined" || !word.stats) {
        return false;
      }

      return true;
    });

    // Shuffle.
    for(var i = 0; i < vocab.length; i++) {
      deck.push(vocab[i]);

      var swapIndex = Math.floor(Math.random() * i);
      var tmp = deck[swapIndex];

      deck[swapIndex] = deck[i];
      deck[i] = tmp;
    }

    this.deck = deck;
    this.previousWords = [];
  },

  /**
   * Determines if the user can start studying.
   */
  canStartStudying: function() {
    if (!jQuery("#levels-container .levels select").val()) {
      jQuery("#levels-container .start-studying").hide();
    } else {
      jQuery("#levels-container .start-studying").show();
    }
  },

  /**
   * Handles clearing the canvas.
   */
  canvasClear: function() {
    this.context.clearRect(
      0, 
      0, 
      this.context.canvas.width, 
      this.context.canvas.height
    );
  },

  /**
   * Draws a new entry onto the canvas after a click event.
   * If moveTo is true, then it will be considered a starting point
   * and not an end point.
   */
  canvasDraw: function(e, moveTo) {
    // Not in drawing mode, return.
    if (!this.drawing) {
      return;
    }

    var x = e.pageX - this.context.canvas.offsetLeft;
    var y = e.pageY - this.context.canvas.offsetTop;

    if (moveTo) {
      this.context.moveTo(x, y);
    } else {
      this.context.lineTo(x, y);
      this.context.stroke();
    }
  },

  /**
   * Handles the initial click of the canvas.
   */
  canvasStart: function(e) {
    this.drawing = true;

    // Remove overlay
    jQuery("#word-container .canvas-wrapper .overlay").hide();
    jQuery("#word-container .canvas-wrapper").css("position", "static");

    this.context.beginPath();
    this.context.lineWidth = this.STROKE_WIDTH;
    this.context.lineJoin = "round";
    this.canvasDraw(e, true);
  },

  /**
   * Handles the mouse release from the canvas.
   */
  canvasStop: function(e) {
    this.context.closePath();
    this.drawing = false;
  },

  /**
   * Draws and animates the selected kanji.
   */
  drawKanji: function() {
    var paths = this._getPaths();

    // Set up recursive drawing.
    jQuery("#paper").animate({ 'to': 1 }, {
      // 3 seconds for each character. Although distribution
      // might be a little off since we are not animating
      // by each character.
      duration: (this.word.character.length * 3000),

      step: $.proxy(function(pos, fx) {
          this.paper.clear();

          // Draw full paths in gray.
          var path = this.paper.path(paths).
            attr("stroke-width", this.STROKE_WIDTH).
            attr("stroke", "#989");

          // Create subpath.
          var offset = path.getTotalLength() * fx.pos;
          var subpath = path.getSubpath(0, offset);
          this.paper.path(subpath).
            attr("stroke-width", this.STROKE_WIDTH).
            attr("stroke", "black");
      }, this),

      // Once it is done, restart the animation.
      complete: $.proxy(function() {
        this.drawKanji();
      }, this)
    });
  },

  /**
   * Retrieves a wanikani API endpoint.
   */
  getApi: function(key, resource, arguments) {
    var url = this.WANIKANI_API;

    url += key + "/";
    url += resource + "/";

    if (arguments) {
      url += arguments;
    }

    return url;
  },

  /**
   * "Private" function designed to get the paths for the
   * current word. Uses the SVG variable in svg.js which
   * has a SVG object for each character.
   */
  _getPaths: function() {
    // Generate paths.
    var chars = this.word.character;

    // Each character is 109 width, by default. Calculate some variables
    // that will help us align the characters properly.
    var paperWidth = jQuery("#paper svg").attr("width");
    var length = 109;       // Size to scale by, length of width and height.

    // Center image.
    var base = {
      x: Math.floor((paperWidth - (chars.length * length)) / 2),
      y: Math.floor((109 - length)/2)
    };

    var paths = [];
    for(var i = 0; i < chars.length; i++) {
      var c = chars[i];

      // Skip if can't find SVG for character.
      if (typeof SVG[c] == "undefined") {
        continue;
      }

      // Get all the d attributes.
      jQuery("path", SVG[c]).each(function() { 
        var d = $(this).attr("d");
        var translateX = (i * 109) + base.x;
        var translate = "T" + translateX.toString() + "," + base.y.toString();
        var transformed = Raphael.transformPath(d, translate);

        paths.push(transformed.join(","));
      });
    }

    return paths.join(" ");
  },

  /**
   * Handles the login/submit button in the login-container.
   */
  login: function() {
    var key = jQuery("#api-key").val();
    var self = this;

    // Disable button.
    jQuery("#login-container .btn-primary").attr("disabled", "disabled");

    // Get the users information and vocabulary.
    var url = App.getApi(key, 'vocabulary');
    jQuery.ajax(url, {
      error: function(xhr, status, message) {
        if (message == "timeout") {
          message = "Response from server timed out";
        }

        self.setLoginError(message);
      },

      success: function(results) {
        // Error exists, print the message.
        if (typeof results["error"] != "undefined") {
          self.setLoginError(results.error.message);
          return;
        }

        if (typeof results["user_information"] == "undefined" ||
          typeof results["requested_information"] == "undefined" ||
          typeof results["requested_information"]["general"] == "undefined") {
          self.setLoginError("Unexpected response from the server.");
        }

        self.vocab = results["requested_information"]["general"];
        self.user = results["user_information"];

        if (!self.vocab.length) {
          self.setLoginError("You need to study some words, first!");
          return;
        }

        // Store the wanikani key.
        chrome.storage.sync.set({"wanikani-api-key": key});

        // Build deck, set up word container and then display it.
        self.setHeader();
        self.showLevels(false);
      },

      timeout: 30000
    });
  },

  /**
   * Handles the event of the logout button being clicked.
   */
  logout: function() {
    jQuery("header .welcome").html("");
    jQuery("#login-container .btn-primary").attr("disabled", null);
    jQuery("#login-container .processing").hide();
    jQuery("body").attr("class", "login");
  },

  /**
   * Would play audio if there was a supporting API to get the file.
   */
  playAudio: function() {},

  /**
   * Handles events that reveal the word to the user.
   */
  revealWord: function() {
    if (this.revealed) {
      return;
    }

    this.revealed = true;

    // Remove overlay
    jQuery("#word-container .paper-wrapper .overlay").hide();
    jQuery("#word-container .word").html(
      "Kanji: " + this.word.character + " " +
      "Kana: " + this.word.kana +  " " +
      "Level: " + this.word.level
    );
    jQuery("#word-container .svg").show();
    this.drawKanji();
  },

  /**
   * Sets the welcome header once the user logs in.
   */
  setHeader: function() {
    jQuery("header .welcome").html("Welcome " + this.user.username + 
      ": <button class='btn btn-link logout'>Logout</button>");
  },

  /**
   * Sets a login error message.
   */
  setLoginError: function(error) {
    jQuery("#login-container .text-danger").html(error ? error : "Uknown error");
    this.logout();
  },

  /**
   * Displays the levels container. If completed is true, notifies the
   * user they reached the page because they completed their studying.
   */ 
  showLevels: function(completed) {
    jQuery("#levels-container .message").html(completed ? 
      "Congratulations! You finished all your words!" : 
      "");

    // Get user levels and iterate through to show the levels they
    // can partake in.
    jQuery("#levels-container .levels select").html("");

    // Get words per level.
    var wordCount = [];
    jQuery.each(this.vocab, function(i, val) {
      var level = val.level;
      if (typeof wordCount[level] == "undefined") {
        wordCount[level] = 0;
      }

      if (typeof val.stats != "undefined" && val.stats != null) {
        wordCount[level]++;
      }
    });

    // Set the levels into the select box.
    for(var i = 1; i <= this.user.level; i++) {
      var words = typeof wordCount[i] != "undefined" ? wordCount[i] : 0;

      // If there's a word count, don't list word.
      if (!wordCount[i]) {
        continue;
      }

      var option = '<option value="' + i + '" selected=selected>Level ' 
        + i + ' (words: ' + wordCount[i] + ')' +
        '</option>';
      jQuery("#levels-container .levels select").append(option);
    }

    this.canStartStudying();
    jQuery("body").attr("class", "levels");
  },

  /**
   * Handles when the back button is clicked.
   */
  showLastWord: function() {
    // Because the current word is in the deck, we need
    // to push twice.
    if (this.previousWords.length > 1) {
      this.deck.push(this.previousWords.pop());
      this.deck.push(this.previousWords.pop());
      this.showNextWord();
    }
  },

  /**
   * Handles setting up the word container for displaying the next word.
   */
  showNextWord: function() {
    // Stop animation and clear canvas.
    jQuery("#paper").stop();
    this.paper.clear();
    this.canvasClear(true);
    this.revealed = false;

    // Show overlays.
    jQuery("#word-container .canvas-wrapper").css("position", "relative");
    jQuery("#word-container .overlay").show();

    // Clear words and insert new meaning.
    jQuery("#word-container .word").html("&nbsp;");
    jQuery("#word-container .meaning").html("&nbsp;");

    // Get new word and insert meaning.
    this.word = this.deck.pop();
    this.previousWords.push(this.word);

    // If previous words is only length one, hide the button.
    if (this.previousWords.length == 1) {
      jQuery("#word-container button.back").hide();
    } else {
      jQuery("#word-container button.back").show();
    }

    // No words? Show levels, again.
    if (typeof this.word == 'undefined') {
      this.showLevels(true);
      return;
    }

    jQuery("#word-container .meaning").html(this.word.meaning);
  },

  /**
   * Once the user clicks the start studying function.
   */
  startStudying: function() {
    this.buildDeck();
    this.showNextWord();
    jQuery("body").attr("class", "word");
  }
}

/**
 * Begin app.
 */
chrome.storage.sync.get("wanikani-api-key", function(results) {
  var apiKey = results["wanikani-api-key"];

  if (apiKey) {
    jQuery("#login-container #api-key").val(apiKey);
  }
});

/***** Events *****/
// If the user clicks on the submit button on login page. 
// Used the API to get the user level.
jQuery(document).on("click", "#login-container .btn-primary[disabled!=disabled]", jQuery.proxy(App.login, App));

// If user clicks the logout button
jQuery(document).on("click", "header .logout", jQuery.proxy(App.logout, App));

// User makes a change to study levels.
jQuery(document).on("change", "#levels-container select", jQuery.proxy(App.canStartStudying, App));

// User clicks to start studying.
jQuery(document).on("click", "#levels-container .start-studying", jQuery.proxy(App.startStudying, App));

// When the user clicks the audio button.
jQuery(document).on("click", "#word-container button.audio", jQuery.proxy(App.playAudio, App));

// When the user clicks the back button.
jQuery(document).on("click", "#word-container button.back", jQuery.proxy(App.showLastWord, App));

// When the user clicks the reveal button.
jQuery(document).on("click", "#word-container .paper-wrapper", jQuery.proxy(App.revealWord, App));
jQuery(document).on("click", "#word-container button.reveal", jQuery.proxy(App.revealWord, App));

// When the user clicks for the next word.
jQuery(document).on("click", "#word-container button.next", jQuery.proxy(App.showNextWord, App));

// If a user draws on the canvas.
jQuery(document).on("click", "#word-container button.clear", function () {
  App.canvasClear(true);
});

// Listen for if the user presses a key.
jQuery(window).on("keydown", function(e) {
  if (jQuery("#word-container :visible").length > 0) {

    switch(String.fromCharCode(e.keyCode)) {
      case "c":
      case "C":
        jQuery("#word-container button.clear").click();
        break;
      case "r":
      case "R":
        jQuery("#word-container button.reveal").click();
        break;
      case "b":
      case "B":
        jQuery("#word-container button.back").click();
        break;
      case "n":
      case "N":
        jQuery("#word-container button.next").click();
        break; 
    }
  }
});

jQuery(document).on("mousedown", ".canvas-wrapper", jQuery.proxy(App.canvasStart, App));
jQuery(document).on("mousemove", "#canvas", jQuery.proxy(App.canvasDraw, App));
jQuery(document).on("mouseleave", "#canvas", jQuery.proxy(App.canvasStop, App));
jQuery(document).on("mouseup", "#canvas", jQuery.proxy(App.canvasStop, App));