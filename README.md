# json-model
standalone javascript library compatible with JSON-API 1.0 (jsonapi.org)

## Preparation

You need set the http requester before usage. 

In angular.js, it would be 

```
angular.module('yourApp', ['deps']).run(['$http', function($http) {
  Base.http = $http;  
}])
```

In other framework, make sure to set `Base.http` to a function that works similarly to angular $http.

## Usage

```

class User extends Base {
  profile: any;
  static url = 'https://api.scixiv.com/v1/users';
  static $callbacks = {afterSave: []};

  constructor(id: number|string) {
    this.profile = {};
    this.$relationships = {
      journals: {list: true, model: Journal},
      involved_journals: { list: true, model: Journal },
      posts: { list: true, model: Post },
      submits: { list: true, model: Post }
    };
    super(id);
  }

  get type(): string {
    return 'users'
  }
}


class Post extends Base {
  mine: boolean;
  to_public: boolean;
  comments;
  static url = 'https://api.scixiv.com/v1/posts';
  static $callbacks = {afterSave: []};

  constructor(id: number|string) {
    this.mine = true;
    this.to_public = true;
    this.$relationships = {
      comments: {list: true, model: Post},
      user: {list: false, model: User}
    }
    super(id);
  }

  get type(): string {
    return 'posts'
  }
}

posts = Post.$search(params) 

post = new Post()

post.$save() 

post.$destroy()

post = new Post(3)

post.$resolve()

post.user 

```
