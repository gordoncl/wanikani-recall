/**
 * Variables and helper functions.
 */
var App = {
  // Constants.
  API_TIMEOUT: 60000,

  STROKE_WIDTH: 3,

  WANIKANI_API: "http://www.wanikani.com/api/user/",

  // Variables.
  context: document.getElementById("canvas").getContext("2d"),

  drawing: false,

  deck: [],

  item: null,

  items: [],

  paper: Raphael("paper", 570, 109),

  previousItems: [],

  revealed: false,

  user: {},

  /**
   * Filters items, add type and append to items list.
   */
  _addItems: function(list, type) {
    // Filter items that haven't been studied and don't have SVG object.
    var list = jQuery.grep(list, jQuery.proxy(function(item) {
      // No character.
      if (!item.character) {
        return false;
      }

      // Not studied yet.
      if (typeof item.stats == "undefined" || !item.stats) {
        return false;
      }

      for(var i = 0; i < item.character.length; i++) {
        var c = item.character[i];

        if (typeof SVG[c] == "undefined") {
          return false;
        }
      }

      return true;
    }, this));

    // Add type.
    list = jQuery.map(list, function(item) {
      item.type = type;
      return item;
    });

    this.items = jQuery.merge(this.items, list);
  },

  /**
   * Builds a deck based on the levels the user has chosen
   * and their completed vocabulary items.
   */
  buildDeck: function() {
    // Just clone vocab.
    var deck = [];

    // Filter words that haven't been started or are not
    // in the selected levels.
    var validTypes = jQuery("#levels-container input:checked").map(function() {
      return jQuery(this).val();
    });
    var validLevels = jQuery("#levels-container .levels select").val();
    var items = jQuery.grep(this.items, function(item) {
      if (jQuery.inArray(item.level.toString(), validLevels) == -1 || 
        jQuery.inArray(item.type.toString(), validTypes) == -1) {
        return false;
      }

      return true;
    });

    // Shuffle.
    for(var i = 0; i < items.length; i++) {
      deck.push(items[i]);

      var swapIndex = Math.floor(Math.random() * i);
      var tmp = deck[swapIndex];

      deck[swapIndex] = deck[i];
      deck[i] = tmp;
    }

    this.deck = deck;
    this.previousItems = [];
  },

  /**
   * Determines if the user can start studying.
   */
  canStartStudying: function() {
    var hasLevels = jQuery("#levels-container .levels select").val();
    var hasTypes = jQuery("#levels-container .levels input:checked").length;

    if (!hasLevels || !hasTypes) {
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
    jQuery("#item-container .canvas-wrapper .overlay").hide();
    jQuery("#item-container .canvas-wrapper").css("position", "static");

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
      duration: (this.item.character.length * 3000),

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
    var chars = this.item.character;

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
    this.items = [];
    this._loginGetVocabulary(key);
  },

  /**
   * Checks to see if the APIs return an error.
   */
  _loginHasErrorResponse: function(results) {
    // Error exists, print the message.
    if (typeof results["error"] != "undefined") {
      this.setLoginError(results.error.message);
      return true;
    }

    if (typeof results["user_information"] == "undefined" ||
      typeof results["requested_information"] == "undefined")
    {
      this.setLoginError("Unexpected response from the server.");
      return true;
    }

    return false;
  },

  /**
   * Handles an AJAX error.
   */
  _loginErrorHelper: function(xhr, status, message) {
    if (message == "timeout") {
      message = "Response from server timed out";
    }

    this.setLoginError(message);
  },

  /**
   * Retrieves the kanji. Takes the API key as a parameter.
   */
  _loginGetKanji: function(key) {
    var url = this.getApi(key, 'kanji');

    jQuery("#login-container .text-info").html("Getting kanji from server");
    jQuery.ajax(url, {
      error: jQuery.proxy(this._loginErrorHelper, this),

      success: jQuery.proxy(function(results) {
        // Error exists, print the message.
        if (this._loginHasErrorResponse(results)) {
          return;
        }

        // Store kanji.
        this._addItems(results["requested_information"], "kanji");

        // Get the radicals now.
        this._loginGetRadicals(key);
      }, this),

      timeout: this.API_TIMEOUT
    });
  },

  /**
   * Retrieves the radicals. Takes the API key as a parameter.
   */
  _loginGetRadicals: function(key) {
    var url = this.getApi(key, 'radicals');

    jQuery("#login-container .text-info").html("Getting radicals from server");
    jQuery.ajax(url, {
      error: jQuery.proxy(this._loginErrorHelper, this),

      success: jQuery.proxy(function(results) {
        // Error exists, print the message.
        if (this._loginHasErrorResponse(results)) {
          return;
        }

        // Store Radicals.
        this._addItems(results["requested_information"], "radical");

        // Show that the user is logged in and display levels container.
        this.setHeader();
        this.showLevels(false);
      }, this),

      timeout: this.API_TIMEOUT
    });
  },

  /**
   * Retrieves the vocabulary. Takes the API key as a parameter.
   */
  _loginGetVocabulary: function(key) {
    var url = this.getApi(key, 'vocabulary');

    jQuery("#login-container .text-info").html("Getting vocabulary from server");
    jQuery.ajax(url, {
      error: jQuery.proxy(this._loginErrorHelper, this),

      success: jQuery.proxy(function(results) {
        // Error exists, print the message.
        if (this._loginHasErrorResponse(results)) {
          return;
        }

        this._addItems(results["requested_information"]["general"], "vocabulary");
        this.user = results["user_information"];

        // Store the wanikani key.
        chrome.storage.sync.set({"wanikani-api-key": key});

        // Retrieve the Kanji, now.
        this._loginGetKanji(key);
      }, this),

      timeout: this.API_TIMEOUT
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
  revealItem: function() {
    if (this.revealed) {
      return;
    }

    this.revealed = true;

    // Set the display.
    var display = "";
    switch(this.item.type) {
      case "vocabulary":
        display = 
          "Character(s): " + this.item.character + " " +
          "Kana: " + this.item.kana +  " " +
          "Level: " + this.item.level;
        break;
      case "radical":
        display = 
          "Character: " + this.item.character + " " +
          "Level: " + this.item.level;
        break;
      case "kanji":
        var important_reading = this.item.important_reading;
        display = 
          "Character: " + this.item.character + " " +
          important_reading[0].toUpperCase() + important_reading.substr(1) + 
            ": " + this.item[important_reading] +  " " +
          "Level: " + this.item.level;
        break;
    }

    // Remove overlay
    jQuery("#item-container .paper-wrapper .overlay").hide();
    jQuery("#item-container .item").html(display);
    jQuery("#item-container .svg").show();
    this.drawKanji();
  },

  /**
   * Sets the welcome header once the user logs in.
   */
  setHeader: function() {
    jQuery("#login-container .text-info").html("");
    jQuery("header .welcome").html("Welcome " + this.user.username + 
      ": <button class='btn btn-link logout'>Logout</button>");
  },

  /**
   * Sets a login error message.
   */
  setLoginError: function(error) {
    jQuery("#login-container .text-info").html("");
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

    // Get radicals, kanji and vocab per level.
    var radicalCount = this._showLevelsCount("radical");
    var kanjiCount = this._showLevelsCount("kanji");
    var vocabCount = this._showLevelsCount("vocabulary");

    // Set the levels into the select box.
    for(var i = 1; i <= this.user.level; i++) {
      var radicals = typeof radicalCount[i] == "undefined" ? 0 : radicalCount[i];
      var kanji = typeof kanjiCount[i] == "undefined" ? 0 : kanjiCount[i];
      var vocab = typeof vocabCount[i] == "undefined" ? 0 : vocabCount[i];

      var option = '<option value="' + i + '" selected=selected>Level ' + i + 
        ' (' +
          'radicals: ' + radicals + " " +
          'kanji: ' + kanji + " " + 
          'vocab: ' + vocab +
        ')' +
        '</option>';
      jQuery("#levels-container .levels select").append(option);
    }

    this.canStartStudying();
    jQuery("body").attr("class", "levels");
  },

  /**
   * Function to help count items by level.
   */
  _showLevelsCount: function(type) {
    var count = [];

    jQuery.each(this.items, function(i, val) {
      var level = val.level;

      if (typeof count[level] == "undefined") {
        count[level] = 0;
      }

      if (val.type == type) {
        count[level]++;
      }
    });

    return count;
  },

  /**
   * Handles when the back button is clicked.
   */
  showLastItem: function() {
    // Because the current word is in the deck, we need
    // to push twice.
    if (this.previousItems.length > 1) {
      this.deck.push(this.previousItems.pop());
      this.deck.push(this.previousItems.pop());
      this.showNextItem();
    }
  },

  /**
   * Handles setting up the word container for displaying the next word.
   */
  showNextItem: function() {
    // Stop animation and clear canvas.
    jQuery("#paper").stop();
    this.paper.clear();
    this.canvasClear(true);
    this.revealed = false;

    // Show overlays.
    jQuery("#item-container .canvas-wrapper").css("position", "relative");
    jQuery("#item-container .overlay").show();

    // Clear words and insert new meaning.
    jQuery("#item-container .item").html("&nbsp;");
    jQuery("#item-container .meaning").html("&nbsp;");

    // Get new word and insert meaning.
    this.item = this.deck.pop();
    this.previousItems.push(this.item);

    // If previous words is only length one, hide the button.
    if (this.previousItems.length == 1) {
      jQuery("#item-container button.back").hide();
    } else {
      jQuery("#item-container button.back").show();
    }

    // No words? Show levels, again.
    if (typeof this.item == 'undefined') {
      this.showLevels(true);
      return;
    }

    jQuery("#item-container .meaning").html(this.item.type + ": " + this.item.meaning);
  },

  /**
   * Once the user clicks the start studying function.
   */
  startStudying: function() {
    this.buildDeck();
    this.showNextItem();
    jQuery("body").attr("class", "item");
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
jQuery(document).on("change", "#levels-container input", jQuery.proxy(App.canStartStudying, App));
jQuery(document).on("change", "#levels-container select", jQuery.proxy(App.canStartStudying, App));

// User clicks to start studying.
jQuery(document).on("click", "#levels-container .start-studying", jQuery.proxy(App.startStudying, App));

// When the user clicks the audio button.
jQuery(document).on("click", "#item-container button.audio", jQuery.proxy(App.playAudio, App));

// When the user clicks the back button.
jQuery(document).on("click", "#item-container button.back", jQuery.proxy(App.showLastItem, App));

// When the user clicks the reveal button.
jQuery(document).on("click", "#item-container .paper-wrapper", jQuery.proxy(App.revealItem, App));
jQuery(document).on("click", "#item-container button.reveal", jQuery.proxy(App.revealItem, App));

// When the user clicks for the next word.
jQuery(document).on("click", "#item-container button.next", jQuery.proxy(App.showNextItem, App));

// If a user draws on the canvas.
jQuery(document).on("click", "#item-container button.clear", function () {
  App.canvasClear(true);
});

// Listen for if the user presses a key.
jQuery(window).on("keydown", function(e) {
  if (jQuery("#item-container :visible").length > 0) {

    switch(String.fromCharCode(e.keyCode)) {
      case "c":
      case "C":
        jQuery("#item-container button.clear").click();
        break;
      case "r":
      case "R":
        jQuery("#item-container button.reveal").click();
        break;
      case "b":
      case "B":
        jQuery("#item-container button.back").click();
        break;
      case "n":
      case "N":
        jQuery("#item-container button.next").click();
        break; 
    }
  }
});

jQuery(document).on("mousedown", ".canvas-wrapper", jQuery.proxy(App.canvasStart, App));
jQuery(document).on("mousemove", "#canvas", jQuery.proxy(App.canvasDraw, App));
jQuery(document).on("mouseleave", "#canvas", jQuery.proxy(App.canvasStop, App));
jQuery(document).on("mouseup", "#canvas", jQuery.proxy(App.canvasStop, App));