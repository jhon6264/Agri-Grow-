/** Keep one connection for the JS runtime; component cleanup must not close active queries. */
export function connectionOwner<T>(open: () => Promise<T>) {
  let pending: Promise<T> | undefined;
  return () => {
    if (!pending) pending = open().catch(error => { pending = undefined; throw error; });
    return pending;
  };
}
