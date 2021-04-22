---

title: Retest - Docker & Feature Specs
date: 2021-04-20 05:38 UTC
tags: docker, E2E tests, retest, feature spec, github action, github workflow
description: This article describes the end-to-end (2E2) testing setup using Docker for a ruby gem called retest.

---

{::options parse_block_html="true" /}

[retest]: https://github.com/AlexB52/retest

<small style="float:right;"> _20 April 2021_ </small>

# Retest - Docker & Feature specs

Last year, I read the amazing [99 Bottles of OOP](https://sandimetz.com/99bottles) by Sandi Metz, Katrina Owen & TJ Stankus and decided to create a tool to help me refactor code based on the method described in the book. I work in a consultancy and get to touch multiple codebases regularly. I wanted a tool that would allow me to refactor code on **any ruby projects** with no setup. [Retest][retest] was born.

**Retest promise**

> A simple CLI to watch file changes and run their matching ruby specs. Works on any ruby projects with no setup.

<div class="hero">
  ![publication feature](2021-04-20-retest-docker-and-feature-specs/ci.png)
  <small class="d-block text-center">
    <span>CI of retest v1.0.0</span>
  </small>
</div>

## Testing the gem

For some time I relied only on unit tests and manual testing of different ruby setups like Rails, Ruby ad-hoc, Hanami. This was becoming difficult as each setup can be paired with Minitest or RSpec. 

E2E Testing retest is an interesting challenge. I need to run tests locally and on GitHub actions for a specific git branch. The latest state of the gem must be built and tested on multiple ruby setups. For each ruby setup, I need to test whether the gem:

* finds the appropriate test file.
* uses the correct test command.
* displays the correct output after making file changes to the repository.

**Solution: GitHub strategies paired with minimal Docker repositories.**

### Using Docker

I have a love/hate relationship with Docker. We use it extensively at work. I understand its benefits and why people use it but most often than not Docker is slow and a frustrating experience. Unless you have an image laying around, you know you're up for a treat when a Docker app that hasn't been touched for a year needs an issue fixed. Fixing Docker often takes longer than fixing the issue itself…

However, I recently used Docker to test [retest][retest] on different Ruby environments. Docker allows me to spin different ruby apps in a container with retest installed. 

Currently, Retest is being tested on:

|setup / test suite|RSpec|Minitest|
|---|---|---|
|rails|check|check|
|hanami|-|check|
|ruby progam|check|check|

**Bonus: I also test git commands on a git-ruby docker container for the --diff feature**

Check out the [gem][retest], those setups live in the `features` folder. All feature specs follow the same structure.

#### GitHub actions

I use a strategy to dynamically spin 6 jobs (one per ruby app) and call its corresponding test command. 

~~~
app-tests:
    name: ${{ matrix.repo }} feature specs
    runs-on: ubuntu-latest
    strategy:
      matrix:
        repo:
          - ruby-app
          - rails-app
          - hanami-app
          - rspec-rails
          - rspec-ruby
          - git-ruby
    steps:
      - uses: actions/checkout@v2
      - name: Set up Ruby
        uses: ruby/setup-ruby@v1
        with:
          ruby-version: 2.5
          bundler-cache: true
      - run: bin/test/${{ matrix.repo }}
~~~

#### Test commands

A setup can be tested on GitHub actions and locally via a dedicated `bin/test` command. In this example, we run the `bin/test/rails-app` for the rails app using minitest.

~~~bash
#!/usr/bin/env bash

# Build the current state of the gem
bundle install
bundle exec rake build

# Move the .gem file to /features/rails-app folder and rename it retest.gem
ls -t pkg | head -n1 | xargs -I {} mv pkg/{} features/rails-app/retest.gem

# Build features/rails-app/docker-compose.yml and return the results of the tests
docker-compose -f features/rails-app/docker-compose.yml up --build --exit-code-from retest
~~~
{: data-target="code-highlighter.ruby"}

#### Dockerfile & docker-compose.yml

The docker file fits the setup tested, in this case, a rails app without webpack :) One thing to note is that retest is also installed with `RUN gem install retest.gem`

~~~
# features/rails-app/Dockerfile

FROM ruby:2.4.1-alpine

ARG BUILD_PACKAGES="build-base git nodejs tzdata sqlite-dev"

RUN apk update && \
    apk upgrade && \
    apk add --update --no-cache $BUILD_PACKAGES && \
    rm -rf /var/cache/apk/*

WORKDIR /usr/src/app

ENV LANG C.UTF-8
ENV BUNDLER_VERSION 2.1

COPY Gemfile Gemfile.lock retest.gem ./
RUN gem install bundler -v 2.1.4
RUN bundle install
RUN gem install retest.gem

COPY . /usr/src/app

CMD ["bin/setup"]
~~~

~~~
# features/rails-app/docker-compose.yml

version: '3'
services:
  retest:
    build: .
    volumes:
      - .:/usr/src/app
    command: ruby retest/retest_test.rb
~~~

#### The E2E test file

Each app has a `retest/retest_test.rb` file which is a test suite tailored for the  setup under test. Here are some examples of tests ussed.

~~~ruby
require_relative 'test_helper'
require 'minitest/autorun'

$stdout.sync = true

include FileHelper

class MatchingTestsCommandTest < Minitest::Test
  def teardown
    end_retest @output, @pid
  end

  def test_start_retest
    @output, @pid = launch_retest 'retest --rails'

    assert_match <<~EXPECTED, @output.read
      Launching Retest...
      Ready to refactor! You can make file changes now
    EXPECTED
  end

  def test_modify_a_file
    @output, @pid = launch_retest 'retest --rails'

    modify_file 'app/models/post.rb'

    assert_match "Test File Selected: test/models/post_test.rb", @output.read
    assert_match "1 runs, 1 assertions, 0 failures, 0 errors, 0 skips", @output.read
  end
end
~~~
{: data-target="code-highlighter.ruby"}

#### Interesting notes

##### Launching retest on a separate process

Because retest needs a separate window to display test results as people change files, I spawn a process in the container that runs retest and write into a log file. I spawn a retest process per test.

~~~ruby
def launch_retest(command)
  file = OutputFile.new
  pid  = Process.spawn command, out: file.path
  sleep 1.5
  [file, pid]
end

def end_retest(file, pid)
  file&.delete
  if pid
    Process.kill('SIGHUP', pid)
    Process.detach(pid)
  end
end
~~~~
{: data-target="code-highlighter.ruby"}

##### Helper methods

Each repository has a group of helper methods to imitate the creation, update and deletion of a file in the repository under test (and trigger retest). 

Each of those helper methods is implementing a different sleeping time based on the repository type. A rails app will take longer to run a test than a ruby program that is why the sleeping time is 10 seconds for a rails app but 1 second on a ruby program.

~~~ruby
module FileHelper
  def modify_file(path)
    return unless File.exist? path

    old_content = File.read(path)
    File.open(path, 'w') { |file| file.write old_content }

    sleep 10
  end

  def create_file(path, should_sleep: true)
    File.open(path, "w").tap(&:close)

    sleep 10 if should_sleep
  end

  def delete_file(path)
    return unless File.exist? path

    File.delete path
  end
end
~~~
{: data-target="code-highlighter.ruby"}

##### CI Time

Overall CI runs in less than three minutes as each docker job is run in parallel and unit tests are run in less than 30 seconds.