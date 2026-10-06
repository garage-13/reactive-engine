# `reactive`

The `reactive` method creates a deeply reactive object (Proxy) based on the provided target object or array. Unlike atomic signals (`signal`), which require manual access through `.value`, the `reactive` method allows working with complex nested data structures natively using standard JavaScript syntax for reading and direct mutation of properties.

### Architectural Features

1. **Property-level Subscriptions:** Dependencies in the core graph are tracked not for the entire object, but strictly for specific keys (`prop`). If an effect or component reads `user.name`, it subscribes exclusively to this key. Changing the property `user.age` will not trigger its re-execution.
2. **Deep Proxying:** When accessing nested objects or arrays, the method dynamically and lazily wraps them in Proxy structures, automatically forming clear string paths for logging subsystems (e.g., `user.meta.role`).
3. **Proxy Mirroring Cache:** All created Proxies are mirrored in an internal registry `proxyCache`. Repeated calls to the method for the same object will return the existing Proxy, preventing memory leaks and duplicate subscriptions.

### Use Case: Optimizing Large Forms

Ideally suited for heavy interfaces (dynamic tables, surveys with hundreds of fields), as direct mutation of a specific input isolates the change stream and eliminates the need for immutable state copying through the spread operator (`...`).

## Parameters

- **target:** The initial object or array to be proxied.
- **name (optional):** A unique base name for the object for tracing and filtering in the logger.

## Returns

A deeply reactive Proxy of the target object.

## Example

```typescript
// 1. Initialization in a business logic service:
public form = this.engine.reactive({
  user: { name: 'Иван', age: 25 }
}, 'profile-form');

// 2. Direct mutation in an action (Proxy will intercept the tick and start atomic batching):
public updateAge() {
  this.form.user.age += 1; // Automatic log: SIGNAL [profile-form.user.age]
}

// 3. Subscription bridge for UI components:
public uiBridge = this.engine.computed(() => ({
  name: this.form.user.name,
  age: this.form.user.age
}));
```
