/** A successful request is provisional until its transaction commits. */
export function storageTransactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve(), { once: true })
    transaction.addEventListener('abort', () => reject(transaction.error ?? new Error('本地存储事务已中止，请重试')), { once: true })
    transaction.addEventListener('error', () => reject(transaction.error ?? new Error('本地存储失败，请重试')), { once: true })
  })
}
