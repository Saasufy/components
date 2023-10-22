import { create } from '/node_modules/socketcluster-client/socketcluster-client.min.js';

const DEFAULT_AUTH_TOKEN_NAME = 'saasufy.authToken';

let globalSocket;

let urlPartsRegExp = /(^[^:]+):\/\/([^:\/]*)(:[0-9]*)?(\/.*)/;

export function createGlobalSocket(options) {
  globalSocket = create({
    authTokenName: DEFAULT_AUTH_TOKEN_NAME,
    ...options
  });
  return globalSocket;
}

export function getGlobalSocket(options) {
  if (globalSocket) {
    return globalSocket;
  }
  return createGlobalSocket(options);
}

export class SocketProvider extends HTMLElement {
  constructor() {
    super();
    this.saasufySocket = null;
    this.isReady = false;
  }

  connectedCallback() {
    this.isReady = true;
    this.getSocket();
  }

  disconnectedCallback() {
    this.destroySocket();
  }

  static get observedAttributes() {
    return [
      'url',
      'auth-token-name'
    ];
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (!this.isReady) return;
    this.destroySocket();
    this.getSocket();
  }

  destroySocket() {
    if (this.saasufySocket) {
      this.saasufySocket.disconnect();
    }
  }

  getSocket() {
    if (this.saasufySocket) {
      return this.saasufySocket;
    }
    return this.createSocket();
  }

  createSocket() {
    let authTokenName = this.getAttribute('auth-token-name') || DEFAULT_AUTH_TOKEN_NAME;
    let url = this.getAttribute('url') || '';
    let urlOptions;
    let matchedList = url.match(urlPartsRegExp);
    if (matchedList) {
      let [ fullMatch, protocolScheme, hostname, port, path ] = matchedList;
      if (port) {
        port = port.replace(/^:/, '');
      }
      urlOptions = {
        protocolScheme,
        hostname,
        port,
        path
      };
    } else {
      urlOptions = {};
    }
    this.saasufySocket = create({
      authTokenName,
      ...urlOptions
    });

    return this.saasufySocket;
  }
}

export class SocketConsumer extends HTMLElement {
  getSocket() {
    let socket = null;
    let currentNode = this.parentNode;
    while (currentNode) {
      socket = currentNode.saasufySocket;
      if (socket) break;
      currentNode = currentNode.getRootNode().host || currentNode.parentNode;
    }
    return socket;
  }
}

window.customElements.define('socket-provider', SocketProvider);
window.customElements.define('socket-consumer', SocketConsumer);
