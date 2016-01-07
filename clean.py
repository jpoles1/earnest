import pandas as pd
import json
rawdata = pd.read_csv("directloan.csv")
stateabrev = pd.read_csv("stateabrev.csv")
stateabrev.index = stateabrev["code"]
def abrevtost(x):
    try:
        return stateabrev.loc[x]["name"]
    except:
        return None
rawdata["StateAbrev"] = rawdata["State"]
rawdata["State"] = rawdata["State"].apply(abrevtost)
statesum = rawdata.groupby("State").sum().iloc[:,1:]
statepop = pd.read_csv("statepop.csv").loc[:,["NAME", "POPESTIMATE2014"]]
statepop.columns = ["State", "Population"]
statesum = statesum.merge(statepop, left_index=1, right_on="State", how="left")
statesum.index = statesum["State"]
maxes = statesum.apply(max, axis=0)
mins = statesum.apply(min, axis=0)
outputdat = {"vals": statesum.to_dict(), "maxes": maxes.to_dict(), "mins": mins.to_dict()}
with open("statedata.json", "w") as outfile:
    json.dump(outputdat, outfile)