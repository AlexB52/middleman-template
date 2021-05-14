---

title: Skipping Existing ActiveRecord Validations
date: 2021-05-13 23:48 UTC
tags: rails,validations,validation context, activerecord
description: This article describes how to skip existing rails validations for specific validation contexts.

---


{::options parse_block_html="true" /}

<small style="float:right;"> _14January 2021_ </small>

# Skipping Existing ActiveRecord Validations
  
<div class="hero">
  ![publication feature](2021-05-13-skip-existing-validations-in-rails/validations.jpeg)
  <small class="d-block text-center">
    <span>
      Photo by <a href="https://unsplash.com/@glenncarstenspeters?utm_source=unsplash&utm_medium=referral&utm_content=creditCopyText">Glenn Carstens-Peters</a> on <a href="https://unsplash.com/s/photos/planning-checklist?utm_source=unsplash&utm_medium=referral&utm_content=creditCopyText">Unsplash</a>
    </span>
  </small>
</div>

`ActiveModel::Validations` provides `#validation_context` which gets set when using `#valid?` or `#save` on an active record. Here is the [on: option documentation](https://guides.rubyonrails.org/active_record_validations.html#on)

> When triggered by an explicit context, validations are run for that context, as well as any validations **without** a context.

Here is part of the rails implementation:

~~~ruby
# activerecord/lib/active_record/validations.rb
def save(**options)
  # -- ARTICLE NOTE -- super refers to ActiveRecord::Persistence#save
  perform_validations(options) ? super : false 
end

def perform_validations(options = {})
  options[:validate] == false || valid?(options[:context])
end

def valid?(context = nil)
  # -- ARTICLE NOTE -- super refers to ActiveModel::Validation#valid?
  context ||= default_validation_context
  output = super(context)
  errors.empty? && output
end

def default_validation_context
  new_record? ? :create : :update
end
~~~
{: data-target="code-highlighter.ruby"}

When no context is explicitly provided `validation_context` is set to `:create` (when record is new) or `:update` (when record is persisted).

## The context rules

1. When calling `#valid?` validations are run for **explicit contexts** and any validation **without a context**
2. Default contexts are `:create` or `:update` based on whether a model is persisted or not

## The problem: a new validation requirement

Let's say you have a `Movie` class that has a uniqueness validation scoped by `:publication_year` like so: 

~~~ruby
class Movie < ApplicationRecord
  attribute :title,            :string
  attribute :producer,         :string
  attribute :publication_year, :integer

  validate :producer, presence: true
  validate :title, uniqueness: { scope: :publication_year }
end
~~~
{: data-target="code-highlighter.ruby"}

A new requirement comes in and Movies can now be created in batches with a CSV but with a new uniqueness validation. Records must be unique scoped by `:producer` **AND** `:publication_year` **BUT only during a batch upload.** 

*How do you tackle this problem?*

### Method 0: You challenge the requirement

First you take a deep breathe and challenge the requirement. Making validations consistent across the application is always the best approach when possible. It is easier to understand, to change and to maintain. But sometimes requirements are immovable and you need to implement them.

*How do you tackle this problem?*

### Method 1: Skip validations with contexts

**Rule 1: Default contexts are `:create` or `:update` based on whether a model is persisted or not.**

Knowing this, you can write your model this way without altering the behaviour of the validations.

~~~ruby
class Movie < ApplicationRecord
  attribute :title,            :string
  attribute :producer,         :string
  attribute :publication_year, :integer

  validate :producer, presence: true

  with_options on: [:create, :update] do
    validate :title, uniqueness: { scope: :publication_year }
  end
end
~~~
{: data-target="code-highlighter.ruby"}

**Rule 2: When calling `#valid?` validations are run for explicit contexts and any validation without a context.**

You can now introduce a new context specific for the batch upload (`:uploaded`). This will discard the `[:create, :update]` validation context block and run the `[:uploaded]` validation context instead.

~~~ruby
class Movie < ApplicationRecord
  attribute :title,            :string
  attribute :producer,         :string
  attribute :publication_year, :integer

  validate :producer, presence: true

  with_options on: [:create, :update] do
    validate :title, uniqueness: { scope: :publication_year }
  end

  with_options on: [:uploaded] do
    validate :title, uniqueness: { scope: [:producer, :publication_year] }
  end
end
~~~
{: data-target="code-highlighter.ruby"}

You can now override any default validations previously used in the application without rewriting contexts everywhere. You won't need to update all the `@movie.save`, `@movie.create`, `@movie.valid?` references while still skipping that default validation with a new context when doing an upload like so `@movie.valid?(:uploaded)` or `@movie.save(context: :uploaded)`.

### Method 2: Two models

It's worth mentioning that when models are simple, you can consider having multiple models for the same database table like so:

~~~ruby
class Movie::Base < ApplicationRecord
  self.table_name = "movies"
  attribute :title,            :string
  attribute :producer,         :string
  attribute :publication_year, :integer

  validate :producer, presence: true
end

class CSVUpload::Movie < Movie::Base
  validate :title, uniqueness: { scope: [:producer, :publication_year] }
end

class Movie < Movie::Base
  validate :title, uniqueness: { scope: :publication_year }
end

# Then use each class where required
Movie.create(movie_params) # Use in standard MoviesController#create
CSVUpload::Movie.create(movie_params) # Use in CSV Batch upload namespace
~~~
{: data-target="code-highlighter.ruby"}

*Naming might need to change for this option but the idea remains.*

### Other methods

I'm sure there are other methods, you can contact me if there is an easier one that I'm not aware of. I like Method 1. It is pragmatic, keeps one class and is easy to understand by explicitly defining validations at the class level.
