---
layout: home

hero:
  title: "Public methods"
  tagline: "WIP"

features:
  - title: signal
    details: This method allows creating reactive variables that automatically update their subscribers when the value changes.
    link: /en/methods/signal
  - title: computed
    details: This method allows creating computed values that automatically update when their dependent signals change.
    link: /en/methods/computed
  - title: reactive
    details: This method creates a deeply reactive object (Proxy) based on the provided target object or array. Unlike atomic signals, the reactive method allows working with complex nested data structures natively using standard JavaScript syntax for reading and direct mutation of properties.
    link: /en/methods/reactive
  - title: resource
    details: This method allows creating asynchronous resources that automatically update their dependencies when the data changes.
    link: /en/methods/resource
---
