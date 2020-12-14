---

title: Service objects, an alternative
date: 2020-12-05 10:00 UTC
description: In this article, I described an alternative to service objects encountered in Rails codebases.
tags: Rails, ActiveModel, Service Object
social_media: hope.jpg

---

{::options parse_block_html="true" /}

# Service Objects: An Alternative

**Service objects are overused. There, I said it.** This pattern has become the default solution for any new features in a Rails codebase. Service objects mean different things for different people. Here is how I define them:

* Any class which have **one** public `#perform` or `#call` method.
* Any class which name describes an action.
* Example: `PublishApprovedPost.perform(post: @post)`

The intent of the article is to broaden our options as Rails developers and describes an alternative to using service objects with **ActiveModel** on Plain Old Ruby Objects. This is a reliable but undervalued approach that should be part of every Rails developer's toolbox. The article outlines this method in further detail.

## The feature - Publish / Unpublish a Post

The feature we're going to implement here is a simple publish/unpublish action on a Post.

![publication feature](2020-12-05-service-object-alternative/publication-feature.gif)

 Nothing fancy here a `Post` can be `:published` and can belong to a `Publisher`

~~~ruby
  # config/routes.rb
  root 'posts#index'
  resources :posts

  # Models
  class Post < ApplicationRecord
    belongs_to :publisher, optional: true

    delegate :name, to: :publisher, prefix: true, allow_nil: true
  end

  class Publisher < ApplicationRecord
  end

  # db/schema.rb
  # create_table "posts", force: :cascade do |t|
  #   t.string "title"
  #   t.text "body"
  #   t.integer "publisher_id"
  #   t.boolean "published"
  # end

  # create_table "publishers", force: :cascade do |t|
  #   t.string "name"
  # end
~~~
{: data-target="code-highlighter.ruby"}

### The Service Object Way

Let's start by quickly describing how we would tackle this with service objects. Roughly we would add `#new_publication`, `#publish` and `#unpublish` routes to the `:post` resources. Then create two new services: **PublishPost** & **UnpublishPost**

~~~ruby
  # config/routes.rb
  resources :posts do
    get :new_publication, on: :member
    put :publish, on: :member
    put :unpublish, on: :member
  end

  # app/controllers/posts_controller.rb

  def new_publication
  end

  def publish
    if PublishPost.perform(params)
      redirect
    else
      render :new_publication
    end
  end

  def unpublish
    UnpublishPost.perform(params)
    redirect
  end
~~~
{: data-target="code-highlighter.ruby"}

#### The dangers

##### Form Errors

The first thing that comes to mind is how errors are handled and displayed on the view. You'll most likely have to tweak your `_form.html.erb` partial to display errors appropriately because the service object solution doesn't match the Rails approach like ActiveRecord does. To handle errors:

* You might create a view or a form object to handle this part correctly.
* You might proxy errors to the post model and reference `@post` in your `new_publication` view.
* You might loop through a custom array of errors in your view or include `ActiveModel::Validations` to your service.

With time, devs using service objects will probably end up with a solution that they'll apply on all their views. From experience, this is rarely the case and multiple implementations of error handling or form views are spread across the codebase. Devs spend time going against Rails just to use service objects.

##### Controller routes

I admit this one is not inherently a service object flaw. You could use service objects with dedicated RESTful routes. I generally see this implementation paired with service objects for some reason. The `posts_controller` now has three more actions and is likely to grow when you want to archive, review or approve a post. This is likely to make the controller difficult to maintain in the future.

**Idea:** Routes are not just for ActiveRecord classes.

##### Hidden Code

We now have one service for each action which makes it hard to update the code in all the relevant places. Updating the publish service could require updating the unpublish service which is easily forgotten.

**Idea:** Nothing stops a service class having multiple methods. Even the Command Design Pattern, which feels similar to service objects, does consider providing a pair of `#execute` & `#undo` methods. The single responsibility principle is pushed to its extreme making it hard to maintain code and giving a false sense of decoupling.

##### Reusability

The trap of services is to think that they are DRY and reusable. The idea is that a service is so good at doing one thing that it can be reused in other services. This is where the nightmare starts. Those services become bloated by conditions and edge cases once reused. After a while, you end up with a lengthy perform method with nested ifs. This trap is too easy to fall in.

**Idea:** Service classes share the same interface and could use polymorphism. Nothing stops a factory from presenting the right type of service to its client. That said, we tend to handle all use cases in one single class.

### REST & ActiveModel to the rescue.

This new implementation comes down to three things:

* Using **ActiveModel**
* Replacing verbs in classes by nouns
* Sticking to REST actions only: `[:index, :new, :create, :edit, :update, :destroy]`

Instead of publishing and unpublishing a post, we consider creating a publication and destroying a publication for a post.

* `PublishPost#perform` becomes `Publication#create`
* `UnpublishPost#perform` becomes `Publication#destroy`.

#### The Model - Publication

First, there is this idea of a **Publication**. So let's create that class in `app/models/publication.rb`. The publication takes one argument, a post record, and is accessible through a `Post#publication` instance method. That class inherits `ActiveModel::Model` which provides all the methods for a class to act as an ActiveRecord in routes, views and controllers. It even handles I18n out of the box.

* The Publication has two methods `#create` & `#destroy` which are next to each other instead of separate classes.
* The publication has its own validations system. *We could also make Publication and Post share the same errors.*
* The publication can be used in form views without worrying of hardcoding routes, partial names or use a custom view form.

~~~ruby
  class Post < ApplicationRecord
    belongs_to :publisher, optional: true

    delegate :name, to: :publisher, prefix: true, allow_nil: true

    def publication
      Publication.new(self)
    end
  end

  class Publication
    include ActiveModel::Model

    attr_accessor :publisher_id

    validates :publisher_id, presence: true

    attr_reader :post
    def initialize(post)
      @post = post
    end

    def publisher_id
      @publisher_id ||= post.publisher_id
    end

    def create(params)
      assign_attributes(params)

      return unless valid?

      post.update(published: true, publisher_id: publisher_id)
    end

    def destroy
      post.update(published: false, publisher_id: nil)
    end
  end
~~~
{: data-target="code-highlighter.ruby"}

#### The routes

To keep things RESTful we then update our routes to use publication namespace. Following Rails conventions between the ActiveModel and the routes makes it easy to configure.

~~~ruby
  resources :posts do
    resource :publications, only: [:new, :create, :destroy]
  end
~~~
{: data-target="code-highlighter.ruby"}

#### The controller

Nothing fancy here, it takes 2 minutes to read and the controller is not overloaded with custom methods. The controller breathes Rails conventions and we can barely distinguish it from a controller generated through the `rails g scaffold` command.

~~~ruby
  # app/controllers/publications_controller.rb

  class PublicationsController < ApplicationController
    before_action :set_publication

    def new
    end

    def create
      if @publication.create(publication_params)
        redirect_to posts_url, notice: 'Publication was successfully created.'
      else
        render :new
      end
    end

    def destroy
      @publication.destroy
      redirect_to posts_url, notice: 'Publication was successfully destroyed.'
    end

    private

    def set_publication
      @publication = Post.find(params[:post_id]).publication
    end

    # Only allow a list of trusted parameters through.
    def publication_params
      params.require(:publication).permit(:publisher_id)
    end
  end
~~~
{: data-target="code-highlighter.ruby"}

#### The view

The new publication page uses the form helper and errors without requiring fancy hacks. It recognises which route to submit the form and easily matches publication attributes with input fields. No hardcoded form that we then need to parse in the controller or another form object.

The lengthy block in the view (the errors) is a straight copy-paste from a generated view with a `rail g scaffold` command.

~~~erb
  <h1>New Publication</h1>

  <%= form_with(model: [@publication.post, @publication], local: true) do |form| %>
    <% if @publication.errors.any? %>
      <div id="error_explanation">
        <h2><%= pluralize(@publication.errors.count, "error") %> prohibited this @publication from being saved:</h2>

        <ul>
          <% @publication.errors.full_messages.each do |message| %>
            <li><%= message %></li>
          <% end %>
        </ul>
      </div>
    <% end %>

    <div class="field">
      <%= form.label :publisher_id, value: 'Publisher' %>
      <%= form.collection_select :publisher_id, Publisher.all, :id, :name, prompt: 'Choose a publisher' %>
    </div>

    <div class="actions">
      <%= form.submit %>
    </div>
  <% end %>

  <br>

  <%= link_to 'Back', posts_path %>
~~~
{: data-target="code-highlighter.erb"}

### Conclusion

With the ActiveModel implementation, the view (and form), the controller and the model collaborate the same way ActiveRecords would: with perfect harmony. It is elegant, it is simple to understand, it feels right. Why are we not seeing more of this and less of service objects?

#### Plot Twist

To be honest the advice given in this article can also be implemented with service objects:

* Nothing stops us from sticking to REST routes with service objects.
* Nothing stops us from including ActiveModel in service objects.
* Nothing stops us from having more than one public method in service objects.

To some extent, the Publication model is probably more similar to the Command Design Pattern than the service objects implementation described in this article is.

#### It is too simple

The problem with examples like this one is that they end up being discarded straight away by senior developers who argue  they are too simple to address the complexity of production code in practice. This is similar to the way senior developers may discard OOP practices in Sandi Metz books for example.

While this might be a natural instinct it may not help you grow as a dev. I would challenge developers to persevere and not fall back on service objects too soon. Just because you've hit a hurdle with ActiveModel doesn't mean it's impossible. The majority of Rails codebases aren't that special and yours is probably no exception.

#### Further Reading

Service objects... Some see them as best practice, others as an anti-pattern. They are well established in the Rails community but increasingly new developers are challenging them.

* [Reddit: Where did the concept of service object come from?](https://www.reddit.com/r/rails/comments/itivdn/where_did_concept_of_service_object_come_from/)
* [Reddit: Is command pattern a common thing in the industry?](https://www.reddit.com/r/rails/comments/jvxhew/is_command_pattern_a_common_thing_in_the_industry/)
* [Jason Swett: Beware of “service objects” in Rails](https://www.codewithjason.com/rails-service-objects/)