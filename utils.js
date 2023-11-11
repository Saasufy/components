import AGCollection from '/node_modules/ag-collection/ag-collection.js';
import AGModel from '/node_modules/ag-model/ag-model.js';

const DEFAULT_DEBOUNCE_DELAY = 300;
const DEFAULT_RELOAD_DELAY = 0;

export function toSafeHTML(text) {
  if (typeof text === 'string') {
    return text.replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
      .replace(/\n/g, '<br />');
  } else if (text != null && typeof text.toString !== 'function') {
    return '[invalid]';
  }
  return text;
}

export function toExpression(html) {
  return html.replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

export function debouncer() {
  let debounceTimeout = null;
  return function (callback, duration) {
    if (duration == null) duration = DEFAULT_DEBOUNCE_DELAY;
    debounceTimeout && clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
      debounceTimeout = null;
      callback.call(this);
    }, duration);
  };
}

export function toSafeModelValue(value) {
  return Object.fromEntries(
    Object.entries(value || {}).map(
      ([key, value]) => [ key, toSafeHTML(value) ]
    )
  );
}

export function createReactiveCollection(collectionOptions, callback) {
  let collection = new AGCollection({
    changeReloadDelay: DEFAULT_RELOAD_DELAY,
    ...collectionOptions
  });

  (async () => {
    for await (let { error } of collection.listener('error')) {
      console.error(error);
    }
  })();

  collection.safeValue = [];

  (async () => {
    let changes = {};
    for await (let event of collection.listener('change')) {
      // Ignore change events which originate from this collection instance.
      if (!event.isRemote) continue;

      if (event.resourceId != null && changes[event.resourceId] !== false) {
        changes[event.resourceId] = event.isRemote;
      }

      if (!collection.isLoaded) continue;

      collection.safeValue = collection.value.map(toSafeModelValue);

      callback({
        changes
      });
      changes = {};
    }
  })();

  (async () => {
    for await (let event of collection.listener('load')) {
      if (collection.isLoaded && !collection.value.length) {
        callback({
          changes: {}
        });
      }
    }
  })();

  return collection;
}

export function createReactiveModel(modelOptions, callback) {
  let model = new AGModel({
    ...modelOptions
  });

  model.safeValue = {};

  (async () => {
    for await (let { error } of model.listener('error')) {
      console.error(error);
    }
  })();

  (async () => {
    let changes = {};
    for await (let event of model.listener('change')) {
      if (changes[event.resourceField] !== false) {
        changes[event.resourceField] = event.isRemote;
      }

      model.safeValue = toSafeModelValue(model.value);
      callback({
        changes
      });
      changes = {};
    }
  })();

  return model;
}

export function createCollection(collectionOptions) {
  let collection = new AGCollection({
    changeReloadDelay: DEFAULT_RELOAD_DELAY,
    ...collectionOptions
  });

  (async () => {
    for await (let { error } of collection.listener('error')) {
      console.error(error);
    }
  })();

  (async () => {
    for await (let event of collection.listener('change')) {
      if (!collection.isLoaded) continue;
      collection.safeValue = collection.value.map(toSafeModelValue);
    }
  })();

  return collection;
}

export function createModel(modelOptions) {
  let model = new AGModel({
    ...modelOptions
  });

  (async () => {
    for await (let { error } of model.listener('error')) {
      console.error(error);
    }
  })();

  (async () => {
    for await (let event of model.listener('change')) {
      model.safeValue = toSafeModelValue(model.value);
    }
  })();

  return model;
}

let templateFormatters = {
  url: (value) => String(value).toLowerCase().replace(/ /g, '-'),
  lowerCase: (value) => String(value).toLowerCase(),
  upperCase: (value) => String(value).toUpperCase(),
  capitalize: (value) => {
    let valueString = String(value);
    return `${valueString.slice(0, 1).toUpperCase()}${valueString.slice(1)}`;
  },
  trim: (value) => String(value).trim(),
  fallback: (...args) => {
    return args.filter(arg => arg)[0];
  },
  joinFields: (list, field, sep) => {
    return list.map(item => item[field]).join(sep);
  },
  date: (timestamp) => {
    let date = new Date(timestamp);
    let year = date.getFullYear();
    let month = date.toLocaleString('default', { month: 'long' });
    let day = date.getDate();
    let hour = date.getHours();
    let minutes = date.getMinutes();
    return `${month} ${day}, ${year} at ${hour}:${minutes.toString().padStart(2, '0')}`;
  }
};

let templateTagsRegExp = /{{.*?}}/gs;

function execExpression(expression, options) {
  let keys = Object.keys(options);
  let args = [
    ...keys,
    `return (function () {
      return ${expression};
    })();`
  ];
  return (new Function(...args))(...keys.map(key => options[key]));
}

export function renderTemplate(templateString, data, socket) {
  return templateString.replace(templateTagsRegExp, (match) => {
    let expString = match.slice(2, -2);
    let options = {
      ...templateFormatters,
      socket: socket ? {
        state: socket.state,
        pendingReconnect: socket.pendingReconnect,
        connectAttempts: socket.connectAttempts,
        authState: socket.authState,
        authToken: socket.authToken
      } : undefined,
      ...data
    };

    try {
      return toSafeHTML(
        execExpression(
          toExpression(expString),
          options
        )
      );
    } catch (error) {
      return match;
    }
  });
}

export function updateConsumerElements(parentElement, consumers, value) {
  if (parentElement && consumers) {
    let consumerParts = consumers.split(',')
      .filter(part => part)
      .map(part => {
        part = part.trim();
        return part.split(':').map(subPart => subPart.trim());
      })
      .filter(([ selector, attributeName ]) => selector);

    for (let [ selector, attributeName ] of consumerParts) {
      let matchingElements = parentElement.querySelectorAll(selector);
      if (attributeName) {
        for (let element of matchingElements) {
          if (typeof value === 'boolean') {
            if (value) {
              element.setAttribute(attributeName, '');
            } else {
              element.removeAttribute(attributeName);
            }
          } else {
            element.setAttribute(attributeName, value);
          }
        }
      } else {
        for (let element of matchingElements) {
          if (element.nodeName === 'INPUT') {
            if (element.type === 'checkbox') {
              if (value) {
                element.setAttribute('checked', '');
              } else {
                element.removeAttribute('checked');
              }
            } else {
              element.value = value;
            }
          } else if (element.nodeName === 'MODEL-INPUT') {
            element.value = value;
          } else {
            element.innerHTML = value;
          }
        }
      }
    }
  }
}

export function generateRandomHexString(byteLength) {
  let byteArray = new Uint8Array(byteLength);
  crypto.getRandomValues(byteArray);
  return Array.from(byteArray, byte => {
    let firstChar = byte >> 4;
    firstChar = firstChar < 10 ? String(firstChar) : String.fromCharCode(firstChar + 87);
    let secondChar = byte & 0x0f;
    secondChar = secondChar < 10 ? String(secondChar) : String.fromCharCode(secondChar + 87);
    return `${firstChar}${secondChar}`;
  }).join('');
}

export function wait(duration) {
  return new Promise((resolve) => setTimeout(resolve, duration));
}
