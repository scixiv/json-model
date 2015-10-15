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

// parse Resource Object
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

// assign Included Resource Objects List to Relationships Object
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
      if (!targ[key]) {
        targ[key] = new Collection(targ.$relationships[key].model);
      }
      decodeList(targ[key], relats[key]);

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
    targ.$included = jsonObj.included;
  }

  if (jsonObj.hasOwnProperty('links')) {
    targ.$links = jsonObj.links;
  }

  if (jsonObj.hasOwnProperty('meta')) {
    targ.$meta = jsonObj.meta;
  }

  resourcify(targ, jsonObj.data);
}

export function decodeList(collections: any, jsonList: any) {
  if (!jsonList.hasOwnProperty('data')) {
    throw 'invalid list json: missing top "data" attribute';
  }

  collections.splice(0, collections.length);

  for (var i = 0; i < jsonList.data.length; i++) {
    var one = new collections.$model();
    resourcify(one, jsonList.data[i]);
    collections.unshift(one);
  }

  if (jsonList.hasOwnProperty('links')) {
    collections.$links = jsonList.links;
  }

  if (jsonList.hasOwnProperty('meta')) {
    collections.$meta = jsonList.meta;
  }

  return collections;
}

export function encodeSingle(src: any): Object {
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

export function encodeList(src: any): Object {
  var jsonObj: any = { data: [] };

  for (var i = 0; i < src.length; i ++) {
    jsonObj.data.push(encodeSingle(src[i]));
  }

  return  jsonObj;
}

export class Base {
  id: string;
  url: string;
  type: string;
  $http: any;
  public $relationships;
  public $callbacks;
  public $scope;
  $then;
  $included;
  $links;
  $meta;

  constructor(id: number|string) {
    if (id) { this.id = id.toString(); }
    var $callbacks: any = {};
    assign($callbacks, this.$callbacks);
    this.$callbacks = $callbacks;
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

  $url() {
    return this.url + '/' + this.id;
  }

  $save() {
    var self: any = this;
    var reqConf: any = {method: undefined, url: undefined};
    if (typeof self.id !== 'undefined') {
      reqConf.method = 'PATCH';
      reqConf.url = self.$url();
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
    var reqConf: any = {method: undefined, url: undefined};
    var self: any = this;
    var collections: any = new Collection(this);

    reqConf.method = 'GET';
    reqConf.params = params;
    reqConf.url = this.prototype.url;

    this.prototype.$http(reqConf).then( function(res: any) {
      decodeList(collections, res.data);
    }, function (err) {
      console.log('search err', err);
      console.log('search err obj', self);
    });

    return collections;
  }

  static $collection() {
    return new Collection(this);
  }

  static $find(id: number|string) {
    var self: any = this;
    var instance = new self(id);
    instance.$fetch()
    return instance;
  }


  $fetch() {
    var reqConf: any = {method: undefined, url: undefined};
    reqConf.method = 'GET';
    reqConf.url = this.$url();
    var self: any = this;
    this.$then = this.$http(reqConf).then( function(res: any) {
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
    var reqConf: any = {method: undefined, url: undefined};
    reqConf.method = 'DELETE';
    reqConf.url = this.$url();
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
    return encodeSingle(this)
  }

  $decode(json) {
    return decodeSingle(this, json)
  }

  $reveal() {
    if (typeof this.$scope == 'Array') {
      this.$scope.push(this);
    }
  }

  $addRelation(relationLink) {
    var self: any = self;
    var reqConf: any = { method: 'PATCH', url: relationLink };
    reqConf.data = [self.$encode()];
    self.$http(reqConf).then( function(res: any) {
      if (self.$callbacks.hasOwnProperty('afterSaveRelation')) {
        for (var key in self.$callbacks.afterSaveRelation) {
          self.$callbacks.afterSaveRelation[key](self, res);
        }
      }
    }, function (err) {
      if (self.$callbacks.hasOwnProperty('afterSaveRelationError')) {
        for (var key in self.$callbacks.afterSaveRelationError) {
          self.$callbacks.afterSaveRelationError[key](self, err);
        }
      }
    });
  }

  $deleteRelation(relationLink) {
    var self: any = this;
    var reqConf: any = { method: 'DELETE', url: relationLink };
    reqConf.data = [self.$encode()];

    self.$http(reqConf).then( function(res: any) {
      if (self.$callbacks.hasOwnProperty('afterDestroyRelation')) {
        for (var key in self.$callbacks.afterDestroyRelation) {
          self.$callbacks.afterDestroyRelation[key](self, res);
        }
      }
    }, function (err) {
      if (self.$callbacks.hasOwnProperty('afterDestroyRelationError')) {
        for (var key in self.$callbacks.afterDestroyRelationError) {
          self.$callbacks.afterDestroyRelationError[key](self, err);
        }
      }
    });
  }
}

Base.prototype.$callbacks = {afterSave: []};

class Collection extends Array<Base> {
  public $model: any;
  public $relationLink: String;

  constructor(model) {
    super();
    this.$model = model;
  }

  $build() {
    var one = new this.$model();
    one.$scope = this;
    return one;
  }
}
