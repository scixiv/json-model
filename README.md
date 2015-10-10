# json-model
standalone javascript library compatible with JSON-API 1.0 (jsonapi.org)


```
class Post extends JsonModel.Base {
  
}
Post.prototype.type = 'posts';
Post.prototype.url = 'http://localhost:3000/posts';

class Comment extends JsonModel.Base {
  
}
Comment.prototype.type = 'comments';
Comment.prototype.url = 'http://localhost:3000/comments';


posts = Post.$search(params) 

post = new Post(params)

post.$save() 

post.$destroy()

post = new Post(3)

post.$resolve()

post.comments 

```
