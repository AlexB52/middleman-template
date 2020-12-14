---

title: Reflect on past commits
date: 2020-08-25 09:33 UTC
description: Can you understand your old code? A quick way to reflect and give feedback to your past self.
tags: git, continuous improvement, bash, feedback. retrospective.
social_media: code.jpg

---
{::options parse_block_html="true" /}

# Reflect on past commits

*[Originally published for Abletech](https://stories.abletech.nz/reflect-on-past-commits-e0f92071a3fa)*

One of Abletech’s Team Values is Continuous Improvement. We believe in getting better at what we do, a little bit more, every day. We are committed to ‘do the right thing’ and always leave a codebase in better shape than we found it.

Programming is all about writing code that is easy to understand. Why? Developers write code but, most importantly, developers read code. A lot of it. Reading code that is hard to understand is frustrating, scary and slows down productivity.

## Can you understand your old code?

Let’s face it, any new commit is likely to add a bit of technical debt. You probably already get code reviews but they can be rushed by a deadline, or overlooked because it was too long. You could even argue that your pull request was merely a draft that is waiting to be improved. So, why not be proactive and reflect on your past commits?

I invite you to put your version of the #iwrote function in your terminal startup file. When you need a small break, take 2 minutes to reflect on what you wrote “1 month ago” or “6 months ago” or “1 year ago”.

~~~bash
# ~/.zshrc
iwrote() { git log --until=$1 -n ${2:-3} --author="$(git config user.email)" --pretty="%H" | xargs git show }
# usage:
# iwrote "1 year ago"
# iwrote "6 months ago" 4
~~~
{: data-target="code-highlighter.bash"}

The function above takes two parameters, both from the git log command. The first parameter is a period that can be used in the until option of git log. The second is an optional number of commits that defaults to 3 when skipped.

Just like listening to your voice, or watching a recorded video of yourself, reading your past commits can be cringy. However, it is also a powerful way to improve your craft.

Things you can ask yourself while reading past commits:

*Is the change easy to understand? What could make that change better? Is this commit message helping understand the change? Is this commit intent clear enough? Is the change worth having a dedicated commit or could it have been squashed with another one? Has my coding style evolved? In what way and why?*

Why not try it? Make it fun. It will only take two minutes.