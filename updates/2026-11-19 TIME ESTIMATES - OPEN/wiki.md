# Time estimates — wiki

- **A run knows its task.** `runs.item_id` / `crew_time.item_id` are set where the work starts (dispatch). Never
  infer a task from overlapping times: parallel items make that wrong.
- **Active vs. wall.** Active = summed agent time (cost of the work); wall = first start to end (what the user
  waits). Both matter; estimates give active time and tokens, the UI may show wall.
- **Medians.** A hung run would skew a mean; the median with the middle half as a range is honest and simple.
- **No guess beats a bad one.** Under 3 finished samples the estimate is null.
