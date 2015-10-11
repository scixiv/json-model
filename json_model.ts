export function assign(tar: Object, src: Object): Object {
  for (var key in src) {
    if (key[0] !== '$' && src.hasOwnProperty(key)) {
      if (src[key] instanceof Array) {
        tar[key] = [];
        assign(tar[key], src[key]);
      } else {
        tar[key] = src[key];
      }
    }
  }
  return tar;
}

// Parse Resource Object
export function resourcify(targ: any, resObj: any) {
  if (typeof(resObj) == undefined || resObj == null) {
    targ = undefined;
    return
  }

  if (targ.type !== resObj.type) {
    throw 'source type not match: ' + resObj.type + ' != ' + targ.type;
  }

  if (resObj.hasOwnProperty('attributes')) {
    assign(targ, resObj.attributes);
  }

  if (resObj.hasOwnProperty('relationships')) {
    setRaltion(targ, resObj.relationships);
  }

  targ.id = resObj.id;
  return targ;
}

interface Resource {
  id: string;
  type: string;
  attributes?: any;
  relationships?: any;
  links?: any;
}

interface Resources {
  [index: number]: Resource;
}

interface Included {
  [index: string]: Resource;
}

// Assign Included Resource Objects List to Relationships Object
function includify (relats, list: any) {
  for (var key in relats) {
    if (relats[key].data instanceof Array) {
      for (var i =0; i < relats[key].data.length; i++) {
        fetchFromList(relats[key].data[i], list);
      }
    } else {
      fetchFromList(relats[key].data, list);
    }
  }
}

function fetchFromList(item, list: any) {
  if (typeof(item) == undefined || item == null) {
    return
  }
  for (var i = 0; i < list.length; i++) {
    if (list[i].id === item.id && list[i].type === item.type) {
      assign(item, list[i]);
    }
  }
}

function setRaltion(targ, relats) {
  for (var key in targ.$relationships) {
    if (!relats.hasOwnProperty(key)) {
      continue;
    }
    if (targ.$relationships[key].list) {
      if (!targ[key]) { targ[key]= []; }
      decodeList(targ[key], targ.$relationships[key].model, relats[key]);

    } else {
      targ[key] = new targ.$relationships[key].model();
      decodeSingle(targ[key], relats[key]);
    }
  }
}

export function decodeSingle(targ: any, jsonObj: any) {
  if (!jsonObj.hasOwnProperty('data')) {
    throw 'invalid single json: missing top "data" attribute';
  }

  if (jsonObj.hasOwnProperty('included')) {
    includify(jsonObj.data.relationships, jsonObj.included);
  }

  resourcify(targ, jsonObj.data);
}

export function decodeList(collections: any, model: any, jsonList: any) {
  if (!jsonList.hasOwnProperty('data')) {
    throw 'invalid list json: missing top "data" attribute';
  }

  collections.splice(0, collections.length);

  for (var i = 0; i < jsonList.data.length; i++) {
    var one = new model();
    resourcify(one, jsonList.data[i]);
    collections.unshift(one);
  }

  collections.$model = model;

  return collections;
}

export function encode(src: any): Object {
  var jsonObj: any;
  jsonObj = {
    data: {attributes: {}, relationships: {}}
  };

  assign(jsonObj.data.attributes, src);
  delete jsonObj.data.attributes.id;

  jsonObj.data.id = src.id;
  jsonObj.data.type = src.type;

  for (var key in src.$relationships) {
    if (src.$relationships.hasOwnProperty(key)) {
      delete jsonObj.data.attributes[key];
      if (!(src[key] instanceof Array)) {
        jsonObj.data.relationships[key] = {
          data: { id: src[key].id, type: src[key].type }
        }
      } else {
        var data: any = []
        for (var i = 0; i < src[key].length; i++) {
          data.push({ id: src[key][i].id, type: src[key][i].type });
        }
        jsonObj.data.relationships[key] = { data: data } ;
      }
    }
  }

  return  jsonObj;
}


export class Base {
  id: string;
  url: string;
  type: string;
  $http: ng.IHttpService;
  public $relationships;
  public $callbacks;

  constructor(id: number|string) {
    if (id) { this.id = id.toString(); }
    this.$callbacks  = {};
    assign(this.$callbacks, this.$callbacks);
    for (var key in this.$relationships) {
      if (this.$relationships[key].list) {
        this[key] = []
        this[key].$model = this.$relationships[key].model;
      } else {
        this[key] = new this.$relationships[key].model();
      }
    }
  }

  $on(hook: string, func: any) {
    if (!(this.$callbacks[hook] instanceof Array)) {
      this.$callbacks[hook] = [];
    }
    this.$callbacks[hook].unshift(func);
  }

  $save() {
    var self: any = this;
    var reqConf: ng.IRequestConfig = {method: undefined, url: undefined};
    if (typeof self.id !== 'undefined') {
      reqConf.method = 'PATCH';
      reqConf.url = self.url + '/' + self.id;
    } else {
      reqConf.method = 'POST';
      reqConf.url = self.url;
    }
    reqConf.data = self.$encode();
    self.$http(reqConf).then(function(res: any) {
      if (reqConf.method == 'POST') {
        self.$decode(res.data);
      }

      if (self.$callbacks.hasOwnProperty('afterSave')) {
        for (var key in self.$callbacks.afterSave) {
          self.$callbacks.afterSave[key](self, res);
        }
      }
    }, function (err: any) {
      console.log('save err', err);
    })
  }

  static $search(params: any) {
    var reqConf: ng.IRequestConfig = {method: undefined, url: undefined};
    var self: any = this;
    var collections: any = [];

    reqConf.method = 'GET';
    reqConf.params = params;
    reqConf.url = this.prototype.url;
    collections.$model = this;

    this.prototype.$http(reqConf).then( function(res: any) {
      decodeList(collections, self, res.data);
    }, function (err) {
      console.log('search err', err);
      console.log('search err obj', self);
    });

    return collections;
  }

  static $find(id: number|string) {
    var self: any = this;
    var instance = new self(id);
    instance.$fetch()
    return instance;
  }


  $fetch() {
    var reqConf: ng.IRequestConfig = {method: undefined, url: undefined};
    reqConf.method = 'GET';
    reqConf.url = this.url + '/' + this.id;
    var self: any = this;
    this.$http(reqConf).then( function(res: any) {
      self.$decode(res.data);

      if (self.$callbacks.hasOwnProperty('afterFetch')) {
        for (var key in self.$callbacks.afterFetch) {
          self.$callbacks.afterFetch[key](self, res);
        }
      }
    });

    return this;
  }

  $destroy() {
    var reqConf: ng.IRequestConfig = {method: undefined, url: undefined};
    reqConf.method = 'DELETE';
    reqConf.url = this.url + '/' + this.id;
    var self: any = this;
    this.$http(reqConf).then( function(res: any) {
      if (self.$callbacks.hasOwnProperty('afterDestroy')) {
        for (var key in self.$callbacks.afterDestroy) {
          self.$callbacks.afterDestroy[key](self, res);
        }
      }
    });
  }

  $encode() {
    return encode(this)
  }

  $decode(json) {
    return decodeSingle(this, json)
  }
};

Base.prototype.$callbacks = {afterSave: []};
