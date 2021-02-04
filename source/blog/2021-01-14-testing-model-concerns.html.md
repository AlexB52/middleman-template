---

title: Testing ActiveRecord Concerns
date: 2021-01-14 10:00 UTC
description: This article outlines how I test Rails concerns used on ActiveRecord models
tags: Rails, ActiveRecord, Concerns, Testing
social_media: masks.jpg

---

{::options parse_block_html="true" /}

<small style="float:right;"> _14January 2021_ </small>

# Testing ActiveRecord concerns

<div class="hero">
  ![publication feature](2021-01-14-testing-model-concerns/masks.jpg)
  <small class="d-block text-center">
    <span>Photo by <a href="https://unsplash.com/@elifborae?utm_source=unsplash&amp;utm_medium=referral&amp;utm_content=creditCopyText">Elif Dilara Bora</a> on <a href="https://unsplash.com/s/photos/venice-carnival?utm_source=unsplash&amp;utm_medium=referral&amp;utm_content=creditCopyText">Unsplash</a></span>
  </small>
</div>


ActiveRecord classes manage persistence and have a tight relationship with their database tables. This relationship, sometimes, makes testing tricky and even trickier when testing Rails concerns. This article describes how to test those concerns used in isolation from its ActiveRecord class and their associated database table.

The code examples are written using RSpec. Switching to Minitest is possible but requires a fair bit of work.

## What are concerns?

Concerns are the Rails way to grant a role or interface to a Ruby class. They provide a nicer syntax than Ruby and aim to clarify confusion around dependencies when used with nested modules. Here is the [documentation](https://api.rubyonrails.org/v6.1.0/classes/ActiveSupport/Concern.html).


## Example: the Reviewable concern

In this example, we'll look at an ActiveRecord class `Post` which includes a `Reviewable` concern. To work properly the concern needs to be included in an ActiveRecord class hooked to a table with a `reviewed_at:datetime` column.

~~~ruby
  # app/models/concerns/reviewable.rb

  # requires #reviewed_at:datetime column
  module Reviewable
    extend ActiveSupport::Concern

    included do
      scope :reviewed, -> { where.not(reviewed_at: nil) }
      scope :unreviewed, -> { where(reviewed_at: nil) }
    end

    def reviewed?
      reviewed_at.present?
    end

    def review(time = DateTime.current)
      update(reviewed_at: time)
    end
  end
~~~
{: data-target="code-highlighter.ruby"}

~~~ruby
  # app/models/post.rb
  class Post < ApplicationRecord
    include Reviewable

    # create_table "posts", force: :cascade do |t|
    #   t.datetime "reviewed_at"
    # end
  end
~~~
{: data-target="code-highlighter.ruby"}

## TL;DR solution

Here is the gist for people looking to see how it's done: [complete solution][gist]. The main idea is to test every concern with a vanilla ApplicationRecord class connected to a temporary database table. Keep reading to see how it works!

~~~ruby
require_relative 'path/to/reviewable/shared/examples'

class FakeReviewable < ApplicationRecord
  include Reviewable
end

describe Reviewable do
  include InMemoryDatabaseHelpers

  switch_to_SQLite do
    create_table :fake_reviewables do |t|
      t.datetime :reviewed_at
    end
  end

  describe FakeReviewable, type: :model do
    include_examples 'reviewable' do
      let(:reviewable) { FakeReviewable.create }
    end
  end
end
~~~
{: data-target="code-highlighter.ruby"}

Let's take a moment to appreciate how explicit this is. The test displays all the information to teach future devs how the `Reviewable` concern is setup: how to grant the role and the minimal schema required for an ActiveRecord to acquire the role. To understand what `Reviewable` does, someone can open `'path/to/reviewable/shared/examples'` and eliminate all the noise from huge test files by only seeing the tests related to `Reviewable` behaviour.

## Why test concerns in isolation?

Switching to an isolated table to test concerns ensures that concerns are decoupled from the first ActiveRecord class they've been introduced into, `Post` in this example.

Failing to extract and test your concern in another class than the original ActiveRecord class is not reusable. It is also a smell that the role is not fully understood or is the wrong abstraction.

Having the concern tested this way gives you more confidence in reusing `Reviewable` with any ActiveRecord class that has a `reviewed_at:datetime` column in its table.


## Testing

### Concerns and interfaces

In OOP, to successfully test a role, you need to define and test its public interface and Rails concerns are no exception. Because `Reviewable` module is included in `Post`, we start by writing the interface tests in the `post_spec.rb` file.

~~~ruby
describe Post do
  describe 'reviewable role' do
    subject { described_class.new }

    it 'has the correct interface' do
      expect(subject).to respond_to(:reviewed?)
      expect(subject).to respond_to(:review)
      expect(described_class).to respond_to(:reviewed)
      expect(described_class).to respond_to(:unreviewed)
    end
  end
end
~~~
{: data-target="code-highlighter.ruby"}

### Concerns and fakes

A role/concern is meant to be shared with other Ruby classes. Currently, `Reviewable` is only included in the `Post` model, however, nothing stops us from including it in other classes, especially testing classes. To do so we extract the role tests into shared tests and include those in the `post_spec.rb` and `reviewable_spec.rb` files:

~~~ruby
shared_examples 'reviewable'do
  subject { described_class.new }

  describe 'the interface' do
    it 'has the correct interface' do
      expect(subject).to respond_to(:reviewed?)
      expect(subject).to respond_to(:review)
      expect(described_class).to respond_to(:reviewed)
      expect(described_class).to respond_to(:unreviewed)
    end
  end
end
~~~
{: data-target="code-highlighter.ruby"}

~~~ruby
# spec/models/post_spec.rb
require_relative 'path/to/reviewable/shared/examples'

describe Post do
  it_behaves_like 'reviewable'
end
~~~
{: data-target="code-highlighter.ruby"}

~~~ruby
# spec/models/concerns/reviewable_spec.rb
require_relative 'path/to/reviewable/shared/examples'

class FakeReviewable
  def self.reviewed
  end

  def self.unreviewed
  end

  def reviewed?
  end

  def review
  end
end

describe FakeReviewable do
  it_behaves_like 'reviewable'
end
~~~
{: data-target="code-highlighter.ruby"}

### Concerns and ActiveRecord

One problem with this test is that while `Post` and `FakeReviewable` share the same interface, they do not share the same behaviour. More importantly, this behaviour is tied to the existence of a table column `reviewed_at:datetime` hooked to the model class. Let's start by adding more tests.

~~~ruby
# requires a :reviewable object
shared_examples 'reviewable'do
  describe 'the interface' do
    subject { described_class.new }

    it 'has the correct interface' do
      expect(subject).to respond_to(:reviewed?)
      expect(subject).to respond_to(:review)
      expect(described_class).to respond_to(:reviewed)
      expect(described_class).to respond_to(:unreviewed)
    end
  end

  describe '#reviewed?' do
    subject { described_class.new }

    it 'returns the correct boolean based on #reviewed_at' do
      subject.reviewed_at = nil
      expect(subject.reviewed?).to eql false

      subject.reviewed_at = DateTime.current
      expect(subject.reviewed?).to eql true
    end
  end

  describe '#review' do
    let(:time) { DateTime.current }

    subject { reviewable.review(time) }

    it 'updates the reviewed_at attribute' do
      expect { subject }.to change { reviewable.reload.reviewed_at }.from(nil).to(time)
    end
  end
end
~~~
{: data-target="code-highlighter.ruby"}

~~~ruby
require_relative 'path/to/reviewable/shared/examples'

describe Post do
  it_behaves_like 'reviewable' do
    let(:reviewable) { Post.create }
  end
end
~~~
{: data-target="code-highlighter.ruby"}

While this causes no problem for `Post`, our `FakeReviewable` class is now in trouble. Few methods are now using ActiveRecord methods like `#reload` or `#assign_attributes`. Even the `Reviewable` module is using the `#update` method. This concern is only to be used with ActiveRecord classes. We could fight against ActiveRecord but a nice workaround is to embrace it and define `FakeReviewable` as one ActiveRecord class:

~~~ruby
require_relative 'path/to/reviewable/shared/examples'

class FakeReviewable < ApplicationRecord
  self.table_name = 'posts'

  include Reviewable
end

describe FakeReviewable do
  it_behaves_like 'reviewable' do
    let(:reviewable) { FakeReviewable.create }
  end
end
~~~
{: data-target="code-highlighter.ruby"}

### Concerns and database integrity

We could stop here and move on to write the scope tests but there is one big problem with this. More often than not, models like `Post` have further validation rules even in their database table. Let's imagine a scenario like this one:

~~~ruby
# create_table "posts", force: :cascade do |t|
#   t.datetime "reviewed_at"
#   t.string "title", null: false
#   t.bigint :author_id, null: false
# end

# add_foreign_key "posts", "authors"

class Post < ApplicationRecord
  include Reviewable

  belongs_to :author

  validates :title, presence: true
end
~~~
{: data-target="code-highlighter.ruby"}

We now need to give our shared examples a valid `reviewable` record or the tests won't pass anymore. We update our code like so:

~~~ruby
require_relative 'path/to/reviewable/shared/examples'

describe Post do
  it_behaves_like 'reviewable' do
    let(:reviewable) { Post.create(title: 'title', author: Author.build) }
  end
end
~~~
{: data-target="code-highlighter.ruby"}

~~~ruby
require_relative 'path/to/reviewable/shared/examples'

class FakeReviewable < ApplicationRecord
  self.table_name = 'posts'

  include Reviewable
end

describe FakeReviewable do
  it_behaves_like 'reviewable' do
    let(:reviewable) { FakeReviewable.create }
  end
end
~~~
{: data-target="code-highlighter.ruby"}

But this will still not work, as `FakeReviewable` class is attached to the `posts` database table and it still requires `:title`, and `:author` to be populated. It almost feels like we need a dedicated table for `FakeReviewable` class...

### Switching to temporary database tables

In an ideal world, we would need a `fake_reviewables` table with a single `reviewed_at` column so that we remove the need for `title` and `author_id` to be populated. One way to do this is to create a dedicated `fake_reviewables` testing table in your `schema.rb` but that table will also end up in your production database.

While we could argue that this is no big deal and there is nothing wrong with having testing tables in production, I'll end this article with some code on how to switch to an in-memory SQLite `fake_reviewables` table.

One way to do this is to include helpers to switch to an in-memory database. Here is the `InMemoryDatabaseHelpers` module and its usage with `FakeReviewable`.

~~~ruby
module InMemoryDatabaseHelpers
  extend ActiveSupport::Concern

  class_methods do
    def switch_to_SQLite(&block)
      before(:all) { switch_to_in_memory_database(&block) }
      after(:all) { switch_back_to_test_database }
    end
  end

  private

  def switch_to_in_memory_database(&block)
    raise 'No migration given' unless block_given?

    ActiveRecord::Migration.verbose = false
    ApplicationRecord.establish_connection(adapter: 'sqlite3', database: ':memory:')
    ActiveRecord::Schema.define(version: 1, &block)
  end

  def switch_back_to_test_database
    ApplicationRecord.establish_connection(ApplicationRecord.configurations['test'])
  end
end
~~~
{: data-target="code-highlighter.ruby"}

~~~ruby
require_relative 'path/to/reviewable/shared/examples'

describe Post do
  it_behaves_like 'reviewable' do
    let(:reviewable) { Post.create(title: 'title', author: Author.build) }
  end
end
~~~
{: data-target="code-highlighter.ruby"}

And finally the solution described in the TL;DR

~~~ruby
require_relative 'path/to/reviewable/shared/examples'

class FakeReviewable < ApplicationRecord
  include Reviewable
end

describe Reviewable do
  include InMemoryDatabaseHelpers

  switch_to_SQLite do
    create_table :fake_reviewables do |t|
      t.datetime :reviewed_at
    end
  end

  describe FakeReviewable, type: :model do
    include_examples 'reviewable' do
      let(:reviewable) { FakeReviewable.create }
    end
  end
end
~~~
{: data-target="code-highlighter.ruby"}

## Food for thought

### What about testing scopes?

This article is quite long already. The same principles would apply to test scopes. If you're interested in a fully working spec suite, here is the [Gist: Testing ActiveRecord Concerns][gist].

### Raw SQL queries

Most of SQL syntax is shared across the mainstream databases and thanks to Rails the SQL is also abstracted in a DSL.

This method of testing concerns will work for most of the use cases, however, concerns introducing raw SQL queries can be a problem. Raw SQL queries can use different syntax between MySQL, SQLite or PostgreSQL. For example, PostgreSQL has a specific syntax for window functions like `OVER (PARTITION BY x)` which I think doesn't exist in SQLite.

In this case, another testing approach would be required for that specific concern. Hopefully, raw SQLs are the exception and not the standard in your Rails codebase.

### Tests are fast

Tests run on a `SQLite memory` database are fast, faster than using MySQL or PostgreSQL to test your application. Here is a quick benchmark to show the differences between PostgreSQL, SQLite file and in-memory databases. The result shows the creation of a thousand posts on a rails console with each adapter.

~~~ruby
Post.create! title: 'title1'
~~~
{: data-target="code-highlighter.ruby"}

~~~bash
                  user     system      total        real
SQLite memory 0.517279   0.046638   0.563917 (  0.568118)
PostgreSQL    0.732682   0.094636   0.827318 (  1.079383)
SQLite file   1.233583   0.692713   1.926296 (  2.064371)
~~~
{: data-target="code-highlighter.bash"}


### Cost of switching

We haven't properly profiled our test suite but our current CI time doesn't seem to have been impacted. Here is a quick benchmark showing the cost of instantiating an in-memory SQLite database and switching back to PostgreSQL.

~~~ruby
Benchmark.bm do |x|
  x.report do
    1_000.times do
      ActiveRecord::Base.establish_connection(adapter: "sqlite3", database: ":memory:")
      ActiveRecord::Schema.define(version: 1) do
        create_table :posts do |t|
          t.string :title
        end
      end
      ApplicationRecord.establish_connection(ApplicationRecord.configurations['development'])
    end
  end
end

~~~
{: data-target="code-highlighter.ruby"}

~~~bash
    user     system      total        real
0.223940   0.029933   0.253873 (  0.254775)
~~~
{: data-target="code-highlighter.bash"}

Switching locally to an in-memory SQLite database for some tests is not taking too long to instantiate. With those results, we could even consider switching before every test that requires a temporary database without being too significant.

~~~bash
(0.0ms)  SELECT sqlite_version(*)
(0.1ms)  CREATE TABLE "posts" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "title" varchar)
(0.1ms)  CREATE TABLE "schema_migrations" ("version" varchar NOT NULL PRIMARY KEY)
(0.1ms)  SELECT "schema_migrations"."version" FROM "schema_migrations" ORDER BY "schema_migrations"."version" ASC
(0.1ms)  INSERT INTO "schema_migrations" (version) VALUES (1)
(0.1ms)  CREATE TABLE "ar_internal_metadata" ("key" varchar NOT NULL PRIMARY KEY, "value" varchar, "created_at" datetime(6) NOT NULL, "updated_at" datetime(6) NOT NULL)
~~~
{: data-target="code-highlighter.bash"}

### Minitest

I love Minitest but I am not aware of a standard method to run expensive tasks before a group of tests like RSpec does with `before(:all)`. One way would be to use [minitest-hooks gem][minitest-hooks] which helps you wrap expensive tasks in a similar fashion to RSpec.

[gist]: https://gist.github.com/AlexB52/0e186b6bd5220d42351f5cffe47439e7
[minitest-hooks]: https://github.com/jeremyevans/minitest-hooks