class ExperimentLogger:
    def __init__(self):
        self.params = {}
        self.metrics = {}

    def log_param(self, key, value):
        self.params[key] = value

    def log_metric(self, key, value):
        self.metrics[key] = value
